export const resolveThrottle = (args, defaultRate) => {
  const hit = args.find((arg) => arg.startsWith('--throttle='));
  const rate = args.includes('--no-throttle') ? 1 : Number(hit ? hit.split('=')[1] : defaultRate);
  const active = rate > 1;

  return {
    rate,
    active,
    tag: active ? `${rate}x` : 'raw',
    forSettings: active ? rate : 0,
  };
};
