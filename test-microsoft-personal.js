// Test script for Microsoft Personal OAuth integration
// This script demonstrates how to use the new microsoft_personal provider

const API_BASE = 'https://api.mailmeow.com'; // Replace with your actual API URL
const API_KEY = 'your_api_key_here'; // Replace with your actual API key

// Test configuration
const testConfig = {
    provider: 'microsoft_personal',
    client_id: 'your_client_id',
    client_secret: 'your_client_secret', 
    refresh_token: 'your_refresh_token',
    test_email: 'recipient@example.com'
};

async function testMicrosoftPersonalOAuth() {
    try {
        console.log('🐾 Testing Microsoft Personal OAuth integration...\n');

        // Step 1: Bind OAuth credentials
        console.log('1. Binding OAuth credentials...');
        const bindResponse = await fetch(`${API_BASE}/api/${API_KEY}/oauth`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                provider: testConfig.provider,
                client_id: testConfig.client_id,
                client_secret: testConfig.client_secret,
                refresh_token: testConfig.refresh_token
            })
        });

        const bindResult = await bindResponse.json();
        console.log('Bind result:', bindResult);

        if (!bindResponse.ok) {
            throw new Error(`Failed to bind OAuth: ${bindResult.error}`);
        }

        // Step 2: Send test email
        console.log('\n2. Sending test email...');
        const emailResponse = await fetch(`${API_BASE}/api/${API_KEY}/email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to: testConfig.test_email,
                subject: 'Test Email from Mail Meow 🐾',
                text: 'Hello! This is a test email sent using Microsoft Personal OAuth integration with Mail Meow. Meow! 🐱📧'
            })
        });

        const emailResult = await emailResponse.json();
        console.log('Email result:', emailResult);

        if (!emailResponse.ok) {
            throw new Error(`Failed to send email: ${emailResult.error}`);
        }

        console.log('\n✅ Microsoft Personal OAuth integration test completed successfully!');
        console.log('🎉 Your Microsoft personal account is now connected to Mail Meow!');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.log('\n📝 Make sure to:');
        console.log('- Replace the test configuration values with your actual credentials');
        console.log('- Ensure your Microsoft app has the correct permissions (Mail.Send, offline_access)');
        console.log('- Verify your refresh token is valid');
        console.log('- Check that your API key is correct');
    }
}

// Uncomment the line below to run the test
// testMicrosoftPersonalOAuth();

console.log('📋 Microsoft Personal OAuth Test Script');
console.log('=====================================');
console.log('Before running this test:');
console.log('1. Update the testConfig object with your actual credentials');
console.log('2. Uncomment the last line to run the test');
console.log('3. Run: node test-microsoft-personal.js');
console.log('\n🔗 For setup instructions, see: docs/MICROSOFT_PERSONAL_OAUTH_SETUP.md');
