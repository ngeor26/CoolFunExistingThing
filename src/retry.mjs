export async function checkWithRetry(check, deadline, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const first = await check();
  if (first.status !== 'unknown' || Date.now() + 90000 >= deadline) return first;
  await pause(3000);
  return check();
}
