const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../api/calendar'), 'utf8');
function load(fetch) {
  const context = { module: {exports: {}}, require: () => ({loadJsonCache: async () => null, saveJsonCache: async () => true}), fetch, URL, AbortSignal };
  vm.runInNewContext(source + '\nmodule.exports.testing = {parseCalendarEvents, fetchSourceEvents};', context);
  return context.module.exports;
}
const ics = lines => ['BEGIN:VCALENDAR', ...lines, 'END:VCALENDAR'].join('\r\n');
test('preserves UTC hockey duration, details, escaped location and folded title', () => {
  const events = load().testing.parseCalendarEvents(ics(['BEGIN:VEVENT','UID:practice-1','SUMMARY:JV Bulldogs',' Practice','LOCATION:Rink\\, Springfield','DESCRIPTION:Bring gear\\nArrive early','DTSTART:20260912T211500Z','DTEND:20260912T223000Z','END:VEVENT']), 'hockey');
  assert.equal(events.length, 1); assert.equal(events[0].summary, 'JV BulldogsPractice');
  assert.equal(events[0].startTime, '21:15'); assert.equal(events[0].endTime, '22:30');
  assert.equal(events[0].endIsUtc, true); assert.equal(events[0].location, 'Rink, Springfield');
  assert.equal(events[0].description, 'Bring gear\nArrive early');
});
test('keeps exclusive all-day end and ignores cancelled events and timezone components', () => {
  const events = load().testing.parseCalendarEvents(ics(['BEGIN:VTIMEZONE','DTSTART:20260308T030000','END:VTIMEZONE','BEGIN:VEVENT','SUMMARY:Break','DTSTART;VALUE=DATE:20261224','DTEND;VALUE=DATE:20270104','END:VEVENT','BEGIN:VEVENT','SUMMARY:Cancelled','DTSTART:20260912T211500Z','STATUS:CANCELLED','END:VEVENT']), 'school');
  assert.equal(events.length, 1); assert.equal(events[0].endExclusive, true); assert.equal(events[0].endDate, '2027-01-04');
});
test('valid empty calendars succeed; overlapping subscriptions deduplicate', async () => {
  const empty = load(async () => ({ok: true, text: async () => ics([])}));
  assert.equal((await empty.testing.fetchSourceEvents({url:'https://example.com'},'hockey')).length, 0);
  const event = ics(['BEGIN:VEVENT','UID:1','SUMMARY:Practice','DTSTART:20260912T211500Z','END:VEVENT']);
  const full = load(async () => ({ok: true, text: async () => event}));
  assert.equal((await full.testing.fetchSourceEvents({urls:['https://a.example','https://b.example']},'hockey')).length, 1);
});
test('partial source failure is not saved as a complete calendar and uses no proxy', async () => {
  let calls = 0;
  const api = load(async () => { calls++; return {ok:false}; });
  await assert.rejects(api.testing.fetchSourceEvents({url:'https://example.com'},'hockey'));
  assert.equal(calls, 1);
});
