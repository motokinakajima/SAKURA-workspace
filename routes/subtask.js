const express = require('express');
const router = express.Router();
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const { transliterate } = require('transliteration');
const EmailSender = require('../EmailSender');
const {cleanUp} = require("../DatabaseUtil");
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const emailSender = new EmailSender(process.env.GMAIL_USER,process.env.GMAIL_CLIENT_ID,process.env.GMAIL_CLIENT_SECRET,process.env.GMAIL_REFRESH_TOKEN);

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

function getProgress(input){
    switch(input){
        case -1:return "開始前";
        case 0:return "進行中";
        case 1:return "完了";
    }
}

router.get('/', async (req, res, next) => {
    const s_id = req.query.sid;
    const { data: taskID, error: taskError } = await supabase.from('subtasks').select('taskID').eq('subtaskID', s_id);
    if(!s_id || !taskID[0]['taskID']){
        res.redirect('/dashboard');
    }else {
        const { data: projectID, error: projectError } = await supabase.from('tasks').select('projectID').eq('taskID', taskID[0]['taskID']);
        if(!projectID[0]['projectID']){
            res.redirect('/dashboard');
        }else {
            const t_id = taskID[0]['taskID'];
            const p_id = projectID[0]['projectID'];
            req.session.currentSubtask = s_id;
            req.session.currentTask = t_id;
            req.session.currentProject = p_id;

            const { data: projectData, error: projectError } = await supabase.from('projects').select('*').eq('projectID', p_id);
            const { data: taskData, error: taskError } = await supabase.from('tasks').select('*').eq('taskID', t_id);
            const { data: subtaskData, error: subtaskError } = await supabase.from('subtasks').select('*').eq('subtaskID', s_id);
            const { data: userData, error } = await supabase.from('users').select('userID, name');
            const { data: commentData, error: commentError } = await supabase.from('comments').select('*').eq('taskID', s_id);

            const returnData = {
                projectData: projectData,
                taskData: taskData,
                subtaskData: subtaskData,
                userID: req.session.userID,
                users: userData,
                comments: commentData,
                supabaseURL: process.env.SUPABASE_URL
            };

            res.render('subtask', returnData);
        }
    }
});

router.post('/', async (req, res, next) => {
    const comment = req.body['comment'];
    const commenterID = req.session.userID;
    const commenterName = req.session.userName;
    const s_id = req.session.currentSubtask;
    const p_id = req.session.currentProject;
    if (!s_id || !p_id || !comment || !commenterID || !commenterName) {
        res.redirect('/dashboard');
    }else {
        const { data: subtaskData, error: subtaskError } = await supabase.from('subtasks').select('*').eq('subtaskID', s_id);

        const { error: insertError } = await supabase.from('comments').insert({ taskID:s_id, comment: comment, commenter_id: commenterID, commenter_name: commenterName });
        res.redirect(`/subtask?sid=${s_id}`);

        const { data: users, _error } = await supabase.from('users').select('*');

        users.forEach(user => {
            if(user.userID === subtaskData[0].responsible){
                emailSender.sendEmail(user.email, "コメントが追加されました", "", `<h1>コメントの追加</h1><p><a href="${process.env.PRODUCT_URL}subtask?sid=${s_id}">${subtaskData[0].name}</a>というサブタスクにコメントが追加されました。確認しましょう。</p><br><p>作成者：${commenterName}</p>`)
                    .then(() => {console.log("sent email successfully");})
                    .catch((error) => {console.error('Failed to send email:', error);});
            }
        });
    }
});

router.post('/update-progress', async (req, res, next) => {
    const { subtaskID, progress } = req.body;

    const { data: subtaskData, error: subtaskError } = await supabase.from('subtasks').select('*').eq('subtaskID', subtaskID);

    if(subtaskData[0].completion !== progress){
        const { _error } = await supabase.from('task_log').insert({ description: `updated progress at ${subtaskData[0].name} (${subtaskID}) from ${getProgress(subtaskData[0].completion)} to ${getProgress(parseInt(progress))}` });
    }

    const { error } = await supabase.from('subtasks').update({ completion: progress }).eq('subtaskID', subtaskID);

    const { data: users, _error } = await supabase.from('users').select('*');

    users.forEach(user => {
        if(user.userID===subtaskData[0].responsible || user.userID===subtaskData[0].accountable || user.userID===subtaskData[0].consulted || user.userID===subtaskData[0].informed){
            let userName = "";
            users.forEach(currentUser => { if(currentUser.userID === req.session.userID){ userName = currentUser.name }; });
            emailSender.sendEmail(user.email, "サブタスクの進行度が編集されました", "", `<h1>サブタスクの進行度の更新</h1><p><a href="${process.env.PRODUCT_URL}subtask?sid=${subtaskID}">${subtaskData[0].name}</a>というタスクの進行度が${getProgress(subtaskData[0].completion)}から${getProgress(parseInt(progress))}に変わりました。確認しましょう。</p><br><p>変更者：${userName}</p>`)
                .then(() => {console.log("sent email successfully");})
                .catch((error) => {console.error('Failed to send email:', error);});
        }
    });
});

router.get('/edit-subtask', async (req, res, next) => {
    const s_id = req.query.sid;
    const { data: taskID, error: taskError } = await supabase.from('subtasks').select('taskID').eq('subtaskID', s_id);
    if(!s_id || !taskID[0]['taskID']){
        res.redirect('/dashboard');
    }else {
        const { data: projectID, error: projectError } = await supabase.from('tasks').select('projectID').eq('taskID', taskID[0]['taskID']);
        if(!projectID[0]['projectID']){
            res.redirect('/dashboard');
        }
        const t_id = taskID[0]['taskID'];
        const p_id = projectID[0]['projectID'];
        req.session.currentSubtask = s_id;
        req.session.currentTask = t_id;
        req.session.currentProject = p_id;
        const { data: subtaskData, error: subtaskError } = await supabase.from('subtasks').select('*').eq('subtaskID', s_id);
        const { data: userData, error: userError } = await supabase.from('users').select('userID, name');
        res.render('edit_subtask', { subtaskData: subtaskData, users: userData, userID: req.session.userID });
    }
});

router.get('/subtasks', async (req, res, next) => {
    const { data: subtaskData, error } = await supabase.from('subtasks').select('*');
    const { data: userData, _error } = await supabase.from('users').select('userID, name');
    req.session.userID ? res.render('subtasks', { subtaskData: subtaskData, userID: req.session.userID, users: userData }) : res.redirect('/dashboard');
});

router.post('/edit-subtask', async (req, res, next) => {
    const { subtask_name, subtask_description, start_date, due_date, priority, responsible, progress } = req.body;
    const s_id = req.session.currentSubtask;
    if (!s_id || !subtask_name || !subtask_description || !start_date || !due_date || !priority || !responsible || !progress) {
        res.redirect('/dashboard');
    } else {
        const { data: subtaskData, error: subtaskError } = await supabase.from('subtasks').select('completion').eq('subtaskID', s_id);

        if(subtaskData[0].completion !== progress){
            const { _error } = await supabase.from('task_log').insert({ description: `updated progress at subtask: ${subtask_name} (${s_id}) from ${getProgress(subtaskData[0].completion)} to ${getProgress(parseInt(progress))}` });
        }

        const { error } = await supabase.from('subtasks').update({ name: subtask_name, description: subtask_description, start: start_date, due: due_date, priority: priority, responsible: responsible, completion: parseInt(progress) }).eq('subtaskID', s_id);
        res.redirect(`/subtask?sid=${s_id}`);

        const { data: users, _error } = await supabase.from('users').select('*');

        users.forEach(user => {
            if(user.userID === responsible){
                let userName = ""
                users.forEach(currentUser => { if(currentUser.userID === req.session.userID){ userName = currentUser.name } });
                emailSender.sendEmail(user.email, "サブタスクが編集されました", "", `<h1>サブタスクの更新</h1><p><a href="${process.env.PRODUCT_URL}subtask?sid=${s_id}">${subtask_name}</a>というサブタスクにResponsibileとして割り当てられました。確認しましょう。</p><br><p>作成者：${userName}</p>`)
                    .then(() => {console.log("sent email successfully");})
                    .catch((error) => {console.error('Failed to send email:', error);});
            }
        });
    }
});

router.post('/delete-subtask', async (req, res, next) =>{
    const subtaskID = req.body['subtaskID'];
    const { error } = await supabase.from('subtasks').delete().eq('subtaskID', subtaskID);
    await cleanUp();
    res.redirect(`/task?tid=${req.session.currentTask}`);
});

module.exports = router;