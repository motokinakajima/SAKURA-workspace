const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const defaultIconPath = path.join(__dirname, '..', 'public', 'images', 'default_icon.jpg');

router.get('/', (req, res, next) => {
    res.render('login', { userID: req.session.userID });
});

router.get('/create', (req, res) => {
    res.render('create_account', { userID: req.session.userID });
});

router.post('/', async (req, res) => {
    const { mail, password } = req.body;

    const {data, error: selectError} = await supabase.from('users').select('*').eq('email', mail);
    if (selectError) {
        res.render('error', {
            message: 'An error occurred while fetching user data',
            error: selectError
        });
    } else if (data[0]) {
        if (data[0].email === mail && data[0].password === password) {
            req.session.userID = data[0].userID;
            req.session.userName = data[0].name;
            res.redirect('/dashboard');
        } else {
            res.redirect('/login');
        }
    } else {
        res.redirect('/dashboard');
    }
});

router.get('/logout', (req, res, next) => {
    req.session.userID = null;
    res.redirect('/');
});

router.post('/create', async (req, res) => {
    const { usr_name, mail, password, keyword } = req.body;

    const { data, error } = await supabase.from('users').select('*').eq('email',mail);

    if(data[0] || keyword !== process.env.LOGIN_KEY){
        res.redirect('/login/create');
    }else{
        let newUserId;
        let isUnique = false;

        while(!isUnique){
            newUserId = "u" + Math.random().toString(36).substring(2);
            const { data, error } = await supabase.from('users').select('*').eq('userID',newUserId);
            if(!data[0]){
                isUnique = true;
            }
        }

        const { error } = await supabase.from('users').insert({ 
            userID: newUserId, name: usr_name, email: mail, password: password });

        if(!error){
            req.session.userID = newUserId;
            req.session.userName = usr_name;
            const fileBuffer = fs.readFileSync(defaultIconPath);
            const fileName = `${newUserId}.jpg`;

            const { data: uploadData, error: uploadError } = await supabase.storage.from('icons').upload(fileName, fileBuffer, { contentType: 'image/jpeg' });

            if (uploadError) {
                res.render('error', {
                    message: 'An error occurred while uploading the icon',
                    error: uploadError
                });
                return;
            }

            res.redirect("/dashboard");

            res.redirect("/dashboard");
        }else{
            res.send("failed");
        }
    }
});

module.exports = router;