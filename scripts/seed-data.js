(async () => {
  const settings = {
    region:'ruk', vehicle:'car', expenseMethod:'mileage', taxYear:'2026/27',
    payeSalary:18000, payeTaxPaid:0, otherIncome:0, studentLoanPlan:'none',
    taxPotMode:'auto', taxPotManualPct:30, vehiclePotPerWeek:30, savingsGoalPerWeek:25,
    potTaxSaved:1400, potVehicleSaved:520, potSavingsSaved:300,
    seStartDate:'2026-04-10', apiKey:'', claudeModel:'claude-haiku-4-5', theme:'system',
    customPlatforms:[], onboarded:true, rateOverrides:{}
  };
  localStorage.setItem('kerb.settings.v1', JSON.stringify(settings));

  // Generate a realistic part-year of shifts (tax year start -> ~now).
  const iso = (d) => d.toISOString().slice(0,10);
  const rnd = (a,b) => Math.round((a + Math.random()*(b-a)) * 100)/100;
  const ri = (a,b) => Math.floor(a + Math.random()*(b-a+1));
  const earnings = [], expenses = [];
  let n = 0;
  const start = new Date('2026-04-06'), end = new Date('2026-09-19');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
    const day = d.getDay(); // 0 Sun .. 6 Sat
    // Amazon Flex on Mon/Wed/Fri/Sat
    if ([1,3,5,6].includes(day)) {
      const hours = [3,3.5,4,4.5][ri(0,3)];
      earnings.push({ id:'e'+(++n), date:iso(d), platform:'amazonflex', amount:rnd(48,68), tips:0, hours, deliveries:0, miles:ri(36,56), notes:'' });
    }
    // Uber Eats on Thu/Fri/Sat/Sun
    if ([4,5,6,0].includes(day) && Math.random() < 0.8) {
      const hours = [2.5,3,3.5,4][ri(0,3)];
      earnings.push({ id:'e'+(++n), date:iso(d), platform:'ubereats', amount:rnd(26,52), tips:rnd(2,9), hours, deliveries:ri(6,14), miles:ri(12,28), notes:'' });
    }
  }
  // Expenses: weekly-ish fuel, monthly phone, occasional bits
  let x = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+7)) {
    expenses.push({ id:'x'+(++x), date:iso(d), category:'fuel', amount:rnd(52,66), vendor:['Shell','BP','Esso','Tesco'][ri(0,3)], bizPct:100, vat:0, notes:'', source: Math.random()<0.4?'claude':'manual', image:'' });
  }
  for (let m = 3; m <= 8; m++) {
    expenses.push({ id:'x'+(++x), date:`2026-${String(m+1).padStart(2,'0')}-05`, category:'phone', amount:22, vendor:'EE', bizPct:50, vat:0, notes:'monthly', source:'manual', image:'' });
  }
  expenses.push({ id:'x'+(++x), date:'2026-04-15', category:'bags', amount:34.99, vendor:'Amazon', bizPct:100, vat:5.83, notes:'thermal bag + mount', source:'claude', image:'' });
  expenses.push({ id:'x'+(++x), date:'2026-06-20', category:'parking', amount:12.5, vendor:'NCP', bizPct:100, vat:0, notes:'', source:'manual', image:'' });
  expenses.push({ id:'x'+(++x), date:'2026-07-02', category:'clothing', amount:26, vendor:'Regatta', bizPct:100, vat:0, notes:'waterproof jacket', source:'claude', image:'' });

  const bills = [
    {id:'b1', name:'Phone contract', amount:22, freq:'monthly', category:'phone', nextDue:'2026-10-05', business:true, bizPct:50},
    {id:'b2', name:'Car insurance (courier)', amount:1180, freq:'annual', category:'insurance', nextDue:'2026-11-12', business:true, bizPct:100},
  ];

  await new Promise((resolve, reject) => {
    const req = indexedDB.open('kerb', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ['earnings','expenses','bills']) {
        if (!db.objectStoreNames.contains(name)) { const os = db.createObjectStore(name,{keyPath:'id'}); os.createIndex('date','date'); }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // clear then repopulate
      const tx = db.transaction(['earnings','expenses','bills'],'readwrite');
      tx.objectStore('earnings').clear(); tx.objectStore('expenses').clear(); tx.objectStore('bills').clear();
      earnings.forEach(o=>tx.objectStore('earnings').put(o));
      expenses.forEach(o=>tx.objectStore('expenses').put(o));
      bills.forEach(o=>tx.objectStore('bills').put(o));
      tx.oncomplete = () => resolve('seeded ' + earnings.length + ' shifts, ' + expenses.length + ' expenses');
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
  return 'seeded ' + earnings.length + ' shifts';
})()
