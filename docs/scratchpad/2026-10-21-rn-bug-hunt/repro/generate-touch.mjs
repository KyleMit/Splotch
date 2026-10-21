import { writeFileSync } from 'node:fs';
const [output, mode = 'joined', contacts = '1'] = process.argv.slice(2);
const width = 1080,
  height = 2400;
const commands = [];
const emit = (c) => commands.push(c);
const inject = (events) => emit({ id: 1, command: 'inject', events: [...events, 0, 0, 0] });
const delay = (duration) => emit({ id: 1, command: 'delay', duration });
emit({
  id: 1,
  command: 'register',
  name: 'RN Hunt Touchscreen',
  vid: 6353,
  pid: 20225,
  bus: 'usb',
  port: 'usb:rnhunt',
  configuration: [
    { type: 'UI_SET_EVBIT', data: [1, 3] },
    { type: 'UI_SET_KEYBIT', data: [330, 325] },
    { type: 'UI_SET_ABSBIT', data: [47, 48, 53, 54, 55, 57] },
    { type: 'UI_SET_PROPBIT', data: [1] },
  ],
  abs_info: [47, 48, 53, 54, 55, 57].map((code) => ({
    code,
    info: {
      value: 0,
      minimum: 0,
      maximum: { 47: 9, 48: 255, 53: width - 1, 54: height - 1, 55: 2, 57: 65535 }[code],
      fuzz: 0,
      flat: 0,
      resolution: 0,
    },
  })),
});
delay(1500);
function down(n, x, y) {
  inject([
    3,
    47,
    n,
    3,
    57,
    11 + n,
    3,
    55,
    0,
    3,
    53,
    x,
    3,
    54,
    y,
    3,
    48,
    10,
    ...(n === 0 ? [1, 330, 1, 1, 325, 1] : []),
  ]);
}
function up(n, last) {
  inject([3, 47, n, 3, 57, -1, ...(last ? [1, 330, 0, 1, 325, 0] : [])]);
}
const count = Number(contacts);
for (let c = 0; c < count; c++) down(c, 280 + c * 85, 850 + c * 170);
const steps = mode === 'stress' ? 3750 : 75;
for (let i = 0; i < steps; i++) {
  const events = [];
  if (mode === 'separate' && i > 0 && i % 25 === 0) {
    for (let c = count - 1; c >= 0; c--) up(c, c === 0);
    delay(250);
    for (let c = 0; c < count; c++)
      down(
        c,
        Math.round(540 + Math.sin((i - 1) * 0.13 + c) * 220),
        Math.round(1250 + Math.cos((i - 1) * 0.09 + c) * 430)
      );
  }
  for (let c = 0; c < count; c++) {
    const x = Math.round(540 + Math.sin(i * 0.13 + c) * 220);
    const y = Math.round(1250 + Math.cos(i * 0.09 + c) * 430);
    events.push(3, 47, c, 3, 53, x, 3, 54, y);
  }
  inject(events);
  delay(16);
}
for (let c = count - 1; c >= 0; c--) up(c, c === 0);
delay(500);
writeFileSync(output, commands.map((c) => JSON.stringify(c)).join('\n') + '\n');
