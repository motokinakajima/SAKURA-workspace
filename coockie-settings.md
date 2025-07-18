# local
```js
app.use(session({
    secret: process.env.SESSION_SECRET || 'default-secret', // Use environment variable
    resave: false,
    saveUninitialized: false,
}));
```
# vercel
```js
app.use(session({
    secret: 'your-secret-key', // Replace with your secret
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to false for HTTP (local development)
        httpOnly: true, // Prevent client-side access to the cookie
        maxAge: 24 * 60 * 60 * 1000 // Cookie expires in 24 hours
    }
}));
```