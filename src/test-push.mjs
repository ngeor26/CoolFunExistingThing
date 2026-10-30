import { push } from './pushover.mjs';
await push('Your daily iPhone Duo checker can send notifications. This is a setup test, not a stock alert.', 'Stock checker test');
console.log('Pushover accepted the test notification.');
