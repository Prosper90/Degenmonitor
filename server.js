// Import required packages
require("dotenv").config();
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const express = require("express");

// MongoDB connection
const MONGO_URI = process.env.MONGODB_URI;
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
}).then(() => console.log('Connected to MongoDB')).catch((err) => console.error('MongoDB connection error:', err));

// Define the Mongoose schema for user warnings
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String },
  warnings: { type: Number, default: 0 },
});

const banSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    username: { type: String },
    bannedAt: { type: Date, default: Date.now },
  });

const User = mongoose.model('User', userSchema);
const Ban = mongoose.model("Ban", banSchema);


// Create a new bot instance
const BOT_TOKEN = process.env.BOT_TOKEN;
const bot = new Telegraf(BOT_TOKEN);

// Helper function to check for Solana contract addresses
function containsSolanaAddress(text) {
  const solanaAddressRegex = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
  return solanaAddressRegex.test(text);
}

// Middleware to monitor messages
bot.on('message', async (ctx) => {
  try {
    const message = ctx.message;

    // Ignore messages that don't have text or aren't from a group
    if (!message.text || !message.chat || message.chat.type === 'private') return;

    // Ignore messages from admins
    const admins = await ctx.telegram.getChatAdministrators(message.chat.id);
    const isAdmin = admins.some((admin) => admin.user.id === message.from.id);
    if (isAdmin) return;

    // Check if the message contains a Solana contract address
    if (containsSolanaAddress(message.text)) {
      const userId = message.from.id.toString();
      const username = message.from.username || message.from.first_name;

      // Find or create a user in the database
      let user = await User.findOne({ userId });
      if (!user) {
        user = new User({ userId, username, warnings: 0 });
      }

      // Increment the warning count
      user.warnings += 1;
      await user.save();

      // Delete the offending message
      await ctx.deleteMessage();

      if (user.warnings < 3) {

        await ctx.reply(
          `@${username}, this is warning #${user.warnings} for sharing a Solana contract address. On the third warning, you will be removed from the group.`
        );
      } else {

        // Save the banned user to the Ban collection
        const ban = new Ban({ userId, username });
        await ban.save();

        // Ban or remove the user from the group
        await ctx.reply(`@${username} has been removed from the group for repeated violations.`);
        await ctx.banChatMember(userId);

        // Optionally delete the user from the database
        await User.deleteOne({ userId });
      }
    }
  } catch (err) {
    console.error('Error handling message:', err);
  }
});


// Middleware to monitor new members joining
bot.on("chat_member", async (ctx) => {
    try {
      const member = ctx.chatMember;
      const userId = member.user.id.toString();
      const username = member.user.username || member.user.first_name;

        if (bannedUser) {
        // Notify admins about the banned user's attempt to join
        await ctx.telegram.sendMessage(
            ctx.chat.id,
            `User @${username} (ID: ${userId}) is banned and tried to join the group. They cannot be added back unless removed from the ban list by an admin.`
        );

        // Kick the banned user
        await ctx.banChatMember(userId);

        console.log(`Banned user @${username} (ID: ${userId}) tried to join and was kicked.`);
        }
    } catch (err) {
      console.error("Error handling new member:", err);
    }
  });



   // Command to unban a user
   bot.command("unban", async (ctx) => {
        try {
        const args = ctx.message.text.split(" ");
        if (args.length < 2) {
            return ctx.reply("Usage: /unban <user_id>");
        }
    
        const userId = args[1];
        const result = await Ban.deleteOne({ userId });
    
        if (result.deletedCount > 0) {
            ctx.reply(`User with ID ${userId} has been unbanned.`);
        } else {
            ctx.reply(`No banned user found with ID ${userId}.`);
        }
        } catch (err) {
        console.error("Error unbanning user:", err);
        ctx.reply("An error occurred while trying to unban the user.");
        }
    });


// Start the bot
bot.launch().then(() => {
  console.log('Bot is running...');
});

// Handle graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Dummy HTTP server to prevent Heroku from crashing
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => {
  res.send("Bot is running...");
});
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});