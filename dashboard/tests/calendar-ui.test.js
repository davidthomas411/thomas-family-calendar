const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

test('month navigation, non-admin filters, hockey times and directions work together', async () => {
  const { window, document } = parseHTML(fs.readFileSync(require.resolve('../index.html'), 'utf8'));
  window.location = {hash: '#calendar'};
  window.localStorage = {getItem: () => null};
  const date = new Date();
  const dateKey = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-12`;
  const entry = {summary:'JV Bulldogs Practice',location:'Springfield rink',startDate:dateKey,startTime:'21:15',endDate:dateKey,endTime:'22:30',isUtc:true,endIsUtc:true,allDay:false};
  const context = {document, window, console, Date, Map, Set, URL, setInterval: () => 0, fetch: async url => ({ok:true,json:async () => url.includes('source=hockey') ? {events:[entry]} : url.includes('calendar-settings') ? {} : {events:[]}})};
  vm.runInNewContext(fs.readFileSync(require.resolve('../calendar-view.js'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(document.getElementById('calendar-filters').hidden, false);
  assert.equal(document.getElementById('calendar-filters-save').hidden, true);
  const chip = document.querySelector('.calendar-event-chip');
  assert.match(chip.textContent, /JV Bulldogs Practice/);
  assert.match(chip.title, /Ends/);
  assert.match(chip.querySelector('a').href, /maps\/search/);
  const label = document.getElementById('calendar-range-label').textContent;
  document.getElementById('calendar-next').click();
  assert.notEqual(document.getElementById('calendar-range-label').textContent, label);
  document.getElementById('calendar-today').click();
  assert.equal(document.getElementById('calendar-range-label').textContent, label);
  const checkbox = document.querySelector('[data-filter="source-hockey"]');
  checkbox.checked = false;
  document.getElementById('calendar-filters-form').dispatchEvent(new window.Event('change'));
  assert.equal(document.querySelector('.calendar-event-chip'), null);
});

test('dashboard keeps manual events while reporting current school feeds and rainy weather', async () => {
  const { window, document } = parseHTML(fs.readFileSync(require.resolve('../index.html'), 'utf8'));
  window.location = {hash:''};
  window.localStorage = {getItem:()=>null,setItem:()=>{}};
  const reported = [];
  let weatherCode;
  window.CalendarHealth = {report:(name)=>reported.push(name)};
  window.RainGlass = {setWeather:code=>{weatherCode=code;}};
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const context = {document,window,console,Date,URL,Map,Set,Image:class {},setInterval:()=>0,requestAnimationFrame:()=>0,fetch:async url=>({ok:true,json:async()=>{
    if (url.includes('openweathermap')) return {main:{temp:65},weather:[{id:500,description:'light rain'}],list:[]};
    if (url === '/api/events') return {events:[{date:today,details:'Family dinner',calendar:'family'}]};
    return {events:[],fetchedAt:Date.now()};
  }})};
  vm.runInNewContext(fs.readFileSync(require.resolve('../weather.js'),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(weatherCode,500);
  assert.ok(reported.includes('school'));
  assert.ok(reported.includes('letter'));
  assert.ok(reported.includes('hockey'));
  assert.match(document.querySelector('[data-person="family"]').textContent,/Family dinner/);
});
