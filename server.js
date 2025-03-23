const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const twilio = require('twilio');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// In-memory store for conversations (in production, use a database)
const conversations = new Map();

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Express server!' });
});


app.post('/api', (req, res) => {
  res.json({ message: "Hello World" })
})

app.post('/send-message', async (req, res) => {
  console.log(req.body)
  try {
    const { to, message } = req.body;

    const response = await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${to}`,
      body: message
    });

    res.json({ success: true, messageId: response.sid });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Send bulk messages
app.post('/start-campaign', async (req, res) => {
  try {
    const { numbers, message } = req.body;
    const campaignId = Date.now().toString();
    const results = [];

    for (const number of numbers) {
      try {
        const response = await client.messages.create({
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
          to: `whatsapp:${number}`,
          body: message
        });

        conversations.set(number, {
          campaignId,
          number,
          lastMessage: message,
          status: 'sent',
          messageHistory: [{
            type: 'sent',
            message,
            timestamp: new Date(),
            messageId: response.sid
          }]
        });

        results.push({
          number,
          status: 'success',
          messageId: response.sid
        });
      } catch (error) {
        results.push({
          number,
          status: 'failed',
          error: error.message
        });
      }
    }

    res.json({
      campaignId,
      results,
      totalSent: results.filter(r => r.status === 'success').length,
      totalFailed: results.filter(r => r.status === 'failed').length
    });

  } catch (error) {
    console.error('Campaign error:', error);
    res.status(500).json({ error: 'Failed to start campaign' });
  }
});

app.post('/receiveMessage',async(req,res)=>{
  console.log(req.body);
  const response = await fetch("https://sbl-gamma.vercel.app/api/chat",{
    method:"POST",
    body:JSON.stringify({message:req.body})
  })
  const data = await response.json()
  console.log(data)
  res.json({message:"Message received"})
})

app.post('/webhook', async (req, res) => {
  const { From, Body, MessageSid } = req.body;
  const phoneNumber = From ? From.replace('whatsapp:', '') : '';

  try {
    const conversation = conversations.get(phoneNumber) || {
      number: phoneNumber,
      messageHistory: []
    };

    conversation.messageHistory.push({
      type: 'received',
      message: Body,
      timestamp: new Date(),
      messageId: MessageSid
    });

    conversations.set(phoneNumber, conversation);

    let responseMessage = await generateResponse(Body, conversation);

    const response = await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${phoneNumber}`,
      body: responseMessage
    });

    conversation.messageHistory.push({
      type: 'sent',
      message: responseMessage,
      timestamp: new Date(),
      messageId: response.sid
    });

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error processing webhook');
  }
});

app.get('/conversation/:number', (req, res) => {
  const { number } = req.params;
  const conversation = conversations.get(number);

  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  res.json(conversation);
});

// Helper function to generate responses (customize this based on your needs)
async function generateResponse(message, conversation) {
  // Add your custom logic here to generate appropriate responses
  // You can use the conversation history to provide context-aware responses

  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('price')) {
    return 'Our prices start from $99. Would you like to know more details?';
  } else if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
    return 'Hello! How can I assist you today?';
  } else if (lowerMessage.includes('thank')) {
    return "You're welcome! Is there anything else I can help you with?";
  }

  return "Thank you for your message. Our team will get back to you shortly.";
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 