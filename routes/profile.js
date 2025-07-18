const express = require('express');
const router = express.Router();
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.get('/', async (req, res, next) => {
    const u_id = req.query.uid;
    if(!u_id || !req.session.userID){
        res.redirect('dashboard');
    }else if(u_id === req.session.userID){
        const { data: userData, error } = await supabase.from('users').select('*').eq('userID', u_id);
        const { data: iconData, _error } = supabase.storage.from('icons').getPublicUrl(`${u_id}.jpg`);
        res.render('edit_profile', { userData: userData, iconData: iconData, userID: req.session.userID });
    }else{
        const { data: userData, error } = await supabase.from('users').select('*').eq('userID', u_id);
        const { data: iconData, _error } = supabase.storage.from('icons').getPublicUrl(`${u_id}.jpg`);
        res.render('profile', { userData: userData, iconData: iconData, userID: req.session.userID });
    }
})

router.post('/edit-profile', async (req, res, next) => {
    const { name, userID } = req.body;
    const editUser = req.session.userID;
    if(userID === editUser){
        const { error } = await supabase.from('users').update({ name: name }).eq('userID', userID);
        res.redirect(`/profile?uid=${userID}`);
    }else{
        res.redirect('/dashboard');
    }
});

router.get('/upload-icon', async (req, res, next) => {
    req.session.userID ? res.render('upload_icon', { userID: req.session.userID }) : res.redirect('/dashboard');
});

router.post('/upload-icon', upload.single('avatar'), async (req, res, next) => {
    const u_id = req.session.userID;
    if(!u_id){
        res.redirect('/dashboard');
    }else{
        const fileName = `${u_id}.jpg`;

        const { error: deleteError } = await supabase.storage.from('icons').remove([fileName]);

        const { data, error } = await supabase.storage.from('icons').upload(fileName, req.file.buffer, { contentType: req.file.mimeType });

        res.redirect(`/profile?uid=${u_id}`);
    }
});

router.get('/get-icon', async (req, res, next) => {
    const u_id = req.query.uid;
    const { data, error } = supabase.storage.from('icons').getPublicUrl(`${u_id}.jpg`);
    console.log(error);
    req.session.userID ? res.render('upload_icon', { userID: req.session.userID }) : res.redirect('/dashboard');
});

module.exports = router;