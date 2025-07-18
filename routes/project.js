const express = require('express');
const router = express.Router();
const path = require('path');
const EmailSender = require('../EmailSender');
const { sendMessageToChannel, client } = require('../DiscordBot');
const { createClient } = require('@supabase/supabase-js');
const {cleanUp} = require("../DatabaseUtil");
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const emailSender = new EmailSender(process.env.GMAIL_USER,process.env.GMAIL_CLIENT_ID,process.env.GMAIL_CLIENT_SECRET,process.env.GMAIL_REFRESH_TOKEN);

router.get('/', async (req, res, next) => {
    const p_id = req.query.pid;
    req.session.currentProject = p_id;
    if (!p_id || !req.session.userID) {
        return res.redirect('/dashboard');
    } else {
        req.session.currentProject = p_id;

        const { data: projectData, error: projectError } = await supabase.from('projects').select('*').eq('projectID', p_id);
        const { data: taskData, error: taskError } = await supabase.from('tasks').select('*').eq('projectID', p_id);
        const { data: userData, error } = await supabase.from('users').select('userID, name');

        const data = {
            projectData: projectData,
            taskData: taskData,
            userID: req.session.userID,
            users: userData
        };

        res.render('project', data);
    }
});

router.get('/projects', async (req, res, next) => {
    if(!req.session.userID || !req.session.userName){
        res.redirect('/')
    }else {
        const { data: projectData, error: error } = await supabase.from('projects').select('*');
        const { data: users, error: _error } = await supabase.from('users').select('userID, name');
        res.render('projects', { projects: projectData, userID: req.session.userID, userName: req.session.userName, userID: req.session.userID, users: users });
    }
});

router.get('/create-task', async (req,res,next) => {
    const { data, error } = await supabase.from('users').select('userID, name');
    req.session.userID? res.render('create_task' ,{ users: data, userID: req.session.userID }) : res.redirect('/dashboard');
});

router.post('/create-task', async (req, res, next) => {
    const { task_name, task_description, start_date, due_date, priority, risk, responsible, accountable, consulted, informed} = req.body;
    const p_id = req.session.currentProject;
    if (!p_id || !task_name || !task_description || !start_date || !due_date || !priority || !risk || !responsible || !accountable || !consulted || !informed) {
        res.redirect('/dashboard');
    } else {
        let newTaskID;
        let isUnique = false;

        while(!isUnique) {
            newTaskID = "t" + Math.random().toString(36).substring(2);
            const { data, error } = await supabase.from('tasks').select('*').eq('taskID', newTaskID);
            if(!data[0]){
                isUnique = true;
            }
        }

        const { error } = await supabase.from('tasks').insert({ taskID: newTaskID, projectID: p_id, name: task_name, description: task_description,
            start: start_date, due: due_date, priority: priority, risk: risk, responsible: responsible, accountable: accountable, consulted: consulted, informed: informed });
        
        res.redirect(`/project?pid=${p_id}`);

        const { data: users, _error } = await supabase.from('users').select('*');

        let userName = ""
        users.forEach(currentUser => { if(currentUser.userID === req.session.userID){ userName = currentUser.name } });

        users.forEach(user => {
            let roles = "";
            if(user.userID===responsible){ roles+=", responsible"; }
            if(user.userID===accountable){ roles+=", accountable"; }
            if(user.userID===consulted){ roles+=", consulted"; }
            if(user.userID===informed){ roles+=", informed"; }
            if(roles!==""){ roles = roles.substring(2); }

            if(roles !== ""){
                emailSender.sendEmail(user.email, "タスクが割り当てられました", "", `<h1>タスク割り当て</h1><p><a href="${process.env.PRODUCT_URL}task?tid=${newTaskID}">${task_name}</a>というタスクに${roles}として割り当てられました。確認しましょう。</p><br><p>作成者：${userName}</p>`)
                .then(() => {console.log("sent email successfully");})
                .catch((error) => {console.error('Failed to send email:', error);});
            }
        });

        const findUserById = (userID) => {
            const user = users.find(user => user.userID === userID);
            return user ? (user.discordID ? `<@${user.discordID}>` : user.name) : "未割り当て";
        };

        const responsibleUser = findUserById(responsible);
        const accountableUser = findUserById(accountable);
        const consultedUser = findUserById(consulted);
        const informedUser = findUserById(informed);

        // メッセージを構築
        const messageContent = `
:clipboard: **タスクが作成されました！**

**タスク名:** [${task_name}](${process.env.PRODUCT_URL}task?tid=${newTaskID})
**作成者:** ${userName}

- Responsible: ${responsibleUser}
- Accountable: ${accountableUser}
- Consulted: ${consultedUser}
- Informed: ${informedUser}
`;

        try {
            await sendMessageToChannel('hayabusa-charmer', messageContent);
            console.log(`Message sent to channel: ${messageContent}`);
        } catch (error) {
            console.error(`Failed to send message: ${error.message}`);
        }
    }
});

router.get('/edit-project', async (req, res, next) => {
    const p_id = req.query.pid;
    if(!p_id || !req.session.userID){
        res.redirect('/dashboard');
    }else{
        req.session.currentProject = p_id;
        const { data: projectData, error: projectError } = await supabase.from('projects').select('*').eq('projectID', p_id);
        res.render('edit_project', { projectData: projectData, userID: req.session.userID });
    }
});

router.post('/edit-project', async(req, res, next) => {
    const { project_name, project_description } = req.body;
    const p_id = req.session.currentProject;
    if(!p_id || !project_name || !project_description){
        res.redirect('/dashboard');
    }else{
        const { error } = await supabase.from('projects').update( {name: project_name, description: project_description }).eq('projectID', p_id);
        res.redirect(`/project?pid=${p_id}`);
    }
});

router.post('/delete-project', async (req, res, next) => {
    const projectID = req.body['projectID'];
    const { error } = await supabase.from('projects').delete().eq('projectID', projectID);
    const { _error } = await supabase.from('tasks').delete().eq('projectID', projectID);
    await cleanUp();
    res.redirect('/dashboard');
})

module.exports = router;
