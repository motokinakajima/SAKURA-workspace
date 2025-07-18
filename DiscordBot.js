const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const discord_bot_token = process.env.DISCORD_BOT_TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

client.once('ready', () => {
  console.log('ボットが起動しました！');
});

client.login(discord_bot_token);

// メッセージを送信する関数
async function sendMessageToChannel(channelName, messageContent) {
  const guild = client.guilds.cache.first(); // 最初のギルドを取得（必要に応じて変更）

  if (!guild) {
    console.error('サーバーが見つかりませんでした。');
    return;
  }

  const channel = guild.channels.cache.find(ch => ch.name === channelName && ch.isTextBased());
  if (!channel) {
    console.error(`チャンネル「${channelName}」が見つかりませんでした。`);
    return;
  }

  try {
    await channel.send(messageContent);
    console.log(`チャンネル「${channelName}」にメッセージを送信しました: ${messageContent}`);
  } catch (error) {
    console.error(`メッセージの送信中にエラーが発生しました: ${error.message}`);
  }
}

module.exports = { client, sendMessageToChannel };