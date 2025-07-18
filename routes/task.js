const express = require('express');
const router = express.Router();
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const { transliterate } = require('transliteration');
const EmailSender = require('../EmailSender');
const { sendMessageToChannel, client } = require('../DiscordBot');
const { cleanUp } = require('../DatabaseUtil');
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

router.get('/', async (req,res,next) => {
    const t_id = req.query.tid;
    const { data: projectID, error } = await supabase.from('tasks').select('projectID').eq('taskID', t_id);
    if(!t_id || !projectID[0]['projectID']){
        res.redirect('/dashboard');
    }else {
        const p_id = projectID[0]['projectID'];
        req.session.currentTask = t_id;
        req.session.currentProject = p_id;

        const { data: projectData, error: projectError } = await supabase.from('projects').select('*').eq('projectID', p_id);
        const { data: taskData, error: taskError } = await supabase.from('tasks').select('*').eq('taskID', t_id);
        const { data: subtaskData, error: subtaskError } = await supabase.from('subtasks').select('*').eq('taskID', t_id);
        const { data: commentData, error: commentError } = await supabase.from('comments').select('*').eq('taskID', t_id);
        const { data: files, error: fileError } = await supabase.from('task_files').select('*').eq('taskID', t_id);
        const { data: userData, error } = await supabase.from('users').select('userID, name');

        const returnData = {
            projectData: projectData,
            taskData: taskData,
            subtaskData: subtaskData,
            comments: commentData,
            files: files,
            userID: req.session.userID,
            users: userData,
            supabaseURL: process.env.SUPABASE_URL
        }

        res.render('task', returnData);
    }
});

router.post('/', async (req,res,next) => {
    const comment = req.body['comment'];
    const commenterID = req.session.userID;
    const commenterName = req.session.userName;
    const t_id = req.session.currentTask;
    const p_id = req.session.currentProject;
    if(!comment || !commenterID || !commenterName || !t_id || !p_id){
        res.redirect('/');
    }else {
        const { data: taskData, error: taskError } = await supabase.from('tasks').select('*').eq('taskID', t_id);
        const { error: insertError } = await supabase.from('comments').insert({ taskID: t_id, comment: comment, commenter_id: commenterID, commenter_name: commenterName });
        res.redirect(`/task?tid=${t_id}`);

        const { data: users, _error } = await supabase.from('users').select('*');

        users.forEach(user => {
            let roles = "";
            if(user.userID===taskData[0].responsible){ roles+=", responsible"; }
            if(user.userID===taskData[0].accountable){ roles+=", accountable"; }
            if(user.userID===taskData[0].consulted){ roles+=", consulted"; }
            if(user.userID===taskData[0].informed){ roles+=", informed"; }
            if(roles!==""){ roles = roles.substring(2); }

            if(roles !== ""){
                let userName = ""
                users.forEach(currentUser => { if(currentUser.userID === req.session.userID){ userName = currentUser.name } });
                emailSender.sendEmail(user.email, "タスクにコメントが着きました", "", `<h1>コメントの投稿</h1><p><a href="https://task-manager-seven-pink.vercel.app/task?tid=${t_id}">${taskData[0].name}</a>というタスクに${userName}がコメントをしました。確認しましょう。</p>`)
                    .then(() => {console.log("sent email successfully");})
                    .catch((error) => {console.error('Failed to send email:', error);});
            }
        });
    }
});

router.get('/tasks', async (req,res,next) => {
    const { data: taskData, error } = await supabase.from('tasks').select('*');
    const { data: userData, _error } = await supabase.from('users').select('userID, name');
    req.session.userID ? res.render('tasks', { taskData: taskData, userID: req.session.userID, users: userData }) : res.redirect('/dashboard');
});

router.get('/edit-task', async (req, res, next) => {
    const t_id = req.query.tid;
    const { data: projectID, error } = await supabase.from('tasks').select('projectID').eq('taskID', t_id);
    if(!t_id || !req.session.userID || !projectID[0]){
        res.redirect('/dashboard');
    }else{
        req.session.currentProject = projectID[0]['projectID'];
        req.session.currentTask = t_id;
        const { data: taskData, error } = await supabase.from('tasks').select('*').eq('taskID', t_id);
        const { data, _error } = await supabase.from('users').select('userID, name');
        res.render('edit_task', { taskData: taskData, users: data, userID: req.session.userID });
    }
});

router.get('/create-subtask', async (req, res, next) => {
    const { data, error } = await supabase.from('users').select('userID, name');
    req.session.userID? res.render('create_subtask' ,{ users: data, userID: req.session.userID }) : res.redirect('/dashboard');
});

router.post('/create-subtask', async (req, res, next) => {
    const { subtask_name, subtask_description, start_date, due_date, priority, responsible} = req.body;
    const t_id = req.session.currentTask;
    if(!t_id || !subtask_name || !subtask_description || !start_date || !due_date || !priority || !responsible){
        res.redirect('/dashboard');
    } else {
        let newSubtaskID;
        let isUnique = false;

        while(!isUnique) {
            newSubtaskID = "s" + Math.random().toString(36).substring(2);
            const { data, error } = await supabase.from('subtasks').select('*').eq('subtaskID', newSubtaskID);
            if(!data[0]){
                isUnique = true;
            }
        }

        const { error } = await supabase.from('subtasks').insert({ subtaskID: newSubtaskID, taskID: t_id, name: subtask_name, description: subtask_description, start: start_date, due: due_date, responsible: responsible, priority: priority });
        res.redirect(`/task?tid=${t_id}`);
        const { data: users, _error } = await supabase.from('users').select('*');

        users.forEach(user => {
            if(user.userID===responsible){
                let userName = ""
                users.forEach(currentUser => { if(currentUser.userID === req.session.userID){ userName = currentUser.name } });
                emailSender.sendEmail(user.email, "サブタスクが割り当てられました", "", `<h1>サブタスク割り当て</h1><p><a href="${process.env.PRODUCT_URL}subtask?sid=${newSubtaskID}">${subtask_name}</a>というサブタスクに割り当てられました。確認しましょう。</p><br><p>作成者：${userName}</p>`)
                    .then(() => {console.log("sent email successfully");})
                    .catch((error) => {console.error('Failed to send email:', error);});
            }
        });
    }
});

router.post('/edit-task', async (req, res, next) => {
    const { task_name, task_description, start_date, due_date, priority, risk, responsible, accountable, consulted, informed, progress} = req.body;
    const p_id = req.session.currentProject;
    const t_id = req.session.currentTask;
    if(!p_id || !t_id || !task_name || !task_description || !start_date || !due_date || !priority || !risk || !responsible || !accountable || !consulted || !informed || !progress){
        res.redirect('/dashboard');
    }else{
        const { data: taskData, error: taskError } = await supabase.from('tasks').select('completion').eq('taskID', t_id);

        if(taskData[0].completion !== progress){
            const { _error } = await supabase.from('task_log').insert({ description: `updated progress at ${task_name} (${t_id}) from ${getProgress(taskData[0].completion)} to ${getProgress(parseInt(progress))}` });
        }

        const { error } = await supabase.from('tasks').update({ taskID: t_id, projectID: p_id, name: task_name, description: task_description,
            start: start_date, due: due_date, priority: priority, risk: risk, responsible: responsible, accountable: accountable, consulted: consulted, informed: informed, completion: progress }).eq('taskID', t_id);
        res.redirect(`/task?tid=${t_id}`);

        const { data: users, _error } = await supabase.from('users').select('*');

        users.forEach(user => {
            let roles = "";
            if(user.userID===responsible){ roles+=", responsible"; }
            if(user.userID===accountable){ roles+=", accountable"; }
            if(user.userID===consulted){ roles+=", consulted"; }
            if(user.userID===informed){ roles+=", informed"; }
            if(roles!==""){ roles = roles.substring(2); }

            if(roles !== ""){
                let userName = ""
                users.forEach(currentUser => { if(currentUser.userID === req.session.userID){ userName = currentUser.name } });
                emailSender.sendEmail(user.email, "タスクが編集されました", "", `<h1>タスクの更新</h1><p><a href="${process.env.PRODUCT_URL}task?tid=${t_id}">${task_name}</a>というタスクに${roles}として割り当てられました。確認しましょう。</p><br><p>作成者：${userName}</p>`)
                .then(() => {console.log("sent email successfully");})
                .catch((error) => {console.error('Failed to send email:', error);});
            }
        });
    }
});

router.post('/delete-task', async (req, res, next) => {
    const taskID = req.body['taskID'];
    const { error } = await supabase.from('tasks').delete().eq('taskID', taskID);
    await cleanUp();
    res.redirect(`/project?pid=${req.session.currentProject}`);
});

router.post('/update-progress', async (req, res, next) => {
    const { taskID, progress } = req.body;

    const { data: taskData, error: taskError } = await supabase.from('tasks').select('*').eq('taskID', taskID);

    if(taskData[0].completion !== progress){
        const { _error } = await supabase.from('task_log').insert({ description: `updated progress at ${taskData[0].name} (${taskID}) from ${getProgress(taskData[0].completion)} to ${getProgress(parseInt(progress))}` });
    }

    const { error } = await supabase.from('tasks').update({ completion: progress }).eq('taskID', taskID);

    const { data: users, _error } = await supabase.from('users').select('*');

    users.forEach(user => {
        if(user.userID===taskData[0].responsible || user.userID===taskData[0].accountable || user.userID===taskData[0].consulted || user.userID===taskData[0].informed){
            let userName = ""
            users.forEach(currentUser => { if(currentUser.userID === req.session.userID){ userName = currentUser.name }; });
            emailSender.sendEmail(user.email, "タスクの進行度が編集されました", "", `<h1>タスクの進行度の更新</h1><p><a href="${process.env.PRODUCT_URL}task?tid=${taskID}">${taskData[0].name}</a>というタスクの進行度が${getProgress(taskData[0].completion)}から${getProgress(parseInt(progress))}に変わりました。確認しましょう。</p><br><p>変更者：${userName}</p>`)
            .then(() => {console.log("sent email successfully");})
            .catch((error) => {console.error('Failed to send email:', error);});
        }
    });
});

router.post('/upload-file', upload.single('taskFile'), async(req, res, next) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }else if(!req.session.currentProject || !req.session.currentProject){
        return res.status(400).send('login before uploading');
    }

    p_id = req.session.currentProject;
    const { taskID } = req.body;
    let originalFileName = path.parse(req.file.originalname).base;

    originalFileName = transliterate(originalFileName);

    const sanitizedFileName = originalFileName.replace(/[^\w\-\.]+/g, '_');
    const fileName = `${taskID}_${sanitizedFileName}`;

    const { data: existingFile, error: existingFileError } = await supabase.storage.from('documents').list('', { prefix: fileName });

    if (existingFile && existingFile.length > 0) {
        const { error: deleteError } = await supabase.storage.from('documents').remove([fileName]);
    }

    const { data, error } = await supabase.storage.from('documents').upload(fileName, req.file.buffer, { contentType: req.file.mimetype });

    const fileUrl = `${supabaseUrl}/storage/v1/object/public/${data.fullPath}`;
    const { error: dbError } = await supabase.from('task_files').insert({ taskID: taskID , fileName: fileName , fileUrl: fileUrl });

    const { data: taskData, error: taskError } = await supabase.from('tasks').select('*').eq('taskID', taskID);

    const { data: users, _error } = await supabase.from('users').select('*');

    users.forEach(user => {
        if(user.userID===taskData[0].responsible || user.userID===taskData[0].accountable || user.userID===taskData[0].consulted || user.userID===taskData[0].informed){
            let userName = ""
            users.forEach(currentUser => { if(currentUser.userID === req.session.userID){ userName = currentUser.name }; });
            emailSender.sendEmail(user.email, "タスクにファイルが添付されました", "", `<h1>ファイルの添付</h1><p><a href="${process.env.PRODUCT_URL}task?tid=${taskID}">${taskData[0].name}</a>というタスクに<a href="${fileUrl}">${sanitizedFileName}</a>が添付されました。確認しましょう。</p><br><p>変更者：${userName}</p>`)
            .then(() => {console.log("sent email succesfully");})
            .catch((error) => {console.error('Failed to send email:', error);});
        }
    });

    res.redirect(`/task?tid=${taskID}`);
});

router.post('/delete-file', async (req, res, next) => {
    const { fileID } = req.body;
    if(!fileID){
        return res.status(400).send('try again');
    }else if(!req.session.currentProject || !req.session.currentProject){
        return res.status(400).send('login before uploading');
    }

    const { data: fileData, error: fileFetchError } = await supabase.from('task_files').select('fileName').eq('id', fileID).single();

    const fileName = fileData.fileName;

    const { error } = await supabase.storage.from('documents').remove([fileName]);

    const { _error } = await supabase.from('task_files').delete().eq('id', fileID);

    res.redirect(`/task?tid=${req.session.currentTask}`);
});

module.exports = router;