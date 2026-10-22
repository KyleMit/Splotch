// The shipping platform module imports $app/environment; native-feedback-adapters.test.mjs pins this pure copy.
export function osLabelFromUserAgent(ua: string): string {
  if (!ua) return '';
  const android = ua.match(/Android ([0-9.]+)/);
  if (android) return `Android ${android[1]}`;
  const ios = ua.match(/(?:iPhone|iPad|iPod).*?OS ([0-9_]+)/);
  if (ios) return `iOS ${ios[1].replace(/_/g, '.')}`;
  const mac = ua.match(/Mac OS X ([0-9_]+)/);
  if (mac) return `macOS ${mac[1].replace(/_/g, '.')}`;
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  const win = ua.match(/Windows NT ([0-9.]+)/);
  if (win) return `Windows (NT ${win[1]})`;
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return '';
}
