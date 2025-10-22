import dotenv from 'dotenv';
dotenv.config();

const AGENT_ID = process.env.ELEVENLABS_AGENT_ID;
const AGENT_KEY = process.env.ELEVENLABS_AGENT_KEY;

async function getAgentDetails() {
    try {
        console.log('Fetching agent details...');
        console.log('Agent ID:', AGENT_ID);

        const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, {
            headers: {
                'xi-api-key': AGENT_KEY
            }
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('\n=== Agent Details ===\n');
        console.log(JSON.stringify(data, null, 2));

        if (data.prompt) {
            console.log('\n=== Agent Prompt/Instructions ===\n');
            console.log(data.prompt);
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

getAgentDetails();
