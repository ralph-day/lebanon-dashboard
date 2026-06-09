/**
 * Run this ONCE locally to generate a Telegram session string.
 * The session string goes into Railway as TELEGRAM_SESSION env var.
 *
 * Usage:
 *   cd server
 *   node telegram-auth.js
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');

const API_ID   = 30521990;
const API_HASH = '9e4cec0708b3d8b0b08b92d682bdd1e2';

(async () => {
  const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, {
    connectionRetries: 5,
    useWSS: true,
  });

  await client.start({
    phoneNumber:  async () => await input.text('Your Telegram phone number (e.g. +9613046661): '),
    password:     async () => await input.text('2FA password (leave blank if none): '),
    phoneCode:    async () => await input.text('Code you received on Telegram: '),
    onError:      (err) => console.error(err),
  });

  console.log('\n✅ Authenticated!\n');
  console.log('Copy this session string into Railway as TELEGRAM_SESSION:\n');
  console.log(client.session.save());
  console.log('\n');

  await client.disconnect();
  process.exit(0);
})();
