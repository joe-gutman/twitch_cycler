// Netlify serverless function to check Twitch stream status
// This runs server-side so credentials stay secure
// Automatically gets app access tokens using Client ID + Client Secret

let cachedToken = null;
let tokenExpiry = null;

// Get app access token from Twitch
async function getAppAccessToken(clientId, clientSecret) {
  // Check if we have a valid cached token
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  
  // Get a new token
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status}`);
  }
  
  const data = await response.json();
  cachedToken = data.access_token;
  // Set expiry to 55 days (tokens last 60 days, refresh early)
  tokenExpiry = Date.now() + (55 * 24 * 60 * 60 * 1000);
  
  return cachedToken;
}

exports.handler = async (event, context) => {
  // Get credentials from environment variables (set in Netlify dashboard)
  const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
  const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
  
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  // Check if credentials are configured
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Twitch credentials not configured. Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in Netlify environment variables.'
      })
    };
  }
  
  try {
    // Get streamers list from query params
    const streamers = event.queryStringParameters?.streamers;
    
    if (!streamers) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing streamers parameter' })
      };
    }
    
    // Get app access token
    const accessToken = await getAppAccessToken(TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET);
    
    // Build Twitch API request
    const usernames = streamers.split(',');
    const queryParams = usernames.map(s => `user_login=${s}`).join('&');
    const url = `https://api.twitch.tv/helix/streams?${queryParams}`;
    
    const response = await fetch(url, {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Twitch API error:', response.status, errorText);
      
      // If token is invalid, clear cache and try again
      if (response.status === 401) {
        cachedToken = null;
        tokenExpiry = null;
      }
      
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: 'Twitch API error',
          status: response.status,
          details: errorText
        })
      };
    }
    
    const data = await response.json();
    
    // Transform data into our format
    const liveStreams = {};
    for (const stream of data.data) {
      liveStreams[stream.user_login.toLowerCase()] = {
        live: true,
        title: stream.title || '',
        game: stream.game_name || '',
        viewers: stream.viewer_count || 0
      };
    }
    
    // Add offline status for channels not in results
    const result = {};
    for (const username of usernames) {
      const usernameLower = username.toLowerCase();
      if (liveStreams[usernameLower]) {
        result[username] = liveStreams[usernameLower];
      } else {
        result[username] = { live: false };
      }
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };
    
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};