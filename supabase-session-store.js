// supabase-session-store.js
const session = require('express-session'); // Import session from express-session
const { createClient } = require('@supabase/supabase-js');

class SupabaseSessionStore extends session.Store { // Use session.Store correctly
    constructor(supabaseClient) {
        super();
        this.supabase = supabaseClient; // Assign the Supabase client to the instance
    }

    async get(sid, callback) {
        try {
            const { data, error } = await this.supabase
                .from('sessions')
                .select('session_data')
                .eq('id', sid)
                .maybeSingle();
    
            if (error) {
                console.error('Error in get:', error);
                return callback(new Error('Failed to get session'));
            }
    
            if (data) {
                callback(null, data.session_data);
            } else {
                callback(null, null); // No session found, return null
            }
        } catch (err) {
            console.error('Exception in get:', err);
            callback(new Error('Failed to get session'));
        }
    }

    async set(sid, sessionData, callback) {
        try {
            const expiresAt = sessionData.cookie.expires ? new Date(sessionData.cookie.expires) : null;
            const { error } = await this.supabase
                .from('sessions')
                .upsert({
                    id: sid,
                    session_data: sessionData,
                    expires_at: expiresAt
                });

            if (error) {
                console.error('Error in set:', error);
                return callback(new Error('Failed to set session'));
            }

            callback(null);
        } catch (err) {
            console.error('Exception in set:', err);
            callback(new Error('Failed to set session'));
        }
    }

    async destroy(sid, callback) {
        try {
            const { error } = await this.supabase
                .from('sessions')
                .delete()
                .eq('id', sid);

            if (error) {
                console.error('Error in destroy:', error);
                return callback(new Error('Failed to destroy session'));
            }

            callback(null);
        } catch (err) {
            console.error('Exception in destroy:', err);
            callback(new Error('Failed to destroy session'));
        }
    }
}

module.exports = SupabaseSessionStore;
