export async function push(message, title = 'iPhone Duo pickup available', fetcher = fetch) {
  const token = process.env.PUSHOVER_APP_TOKEN;
  const user = process.env.PUSHOVER_USER_KEY;
  if (!token || !user) throw new Error('Set PUSHOVER_APP_TOKEN and PUSHOVER_USER_KEY as GitHub Actions secrets.');
  const body = new URLSearchParams({ token, user, title, message: message.slice(0, 1000),
    url: 'https://www.t-mobile.com/cell-phone/apple-iphone-duo', url_title: 'Check T-Mobile' });
  const response = await fetcher('https://api.pushover.net/1/messages.json', {
    method: 'POST', body, signal: AbortSignal.timeout(20000)
  });
  const data = await response.json();
  if (!response.ok || data.status !== 1) throw new Error(`Pushover rejected the notification (HTTP ${response.status}). Check the secret values and account limits.`);
}
