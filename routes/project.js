const express = require('express');
const router = express.Router();
const path = require('path');
const EmailSender = require('../EmailSender'); // Kept for compatibility - now returns dummy class
// const { sendMessageToChannel, client } = require('../DiscordBot'); // Discord functionality disabled
const { createClient } = require('@supabase/supabase-js');
const {cleanUp} = require("../DatabaseUtil");
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Gmail functionality disabled - EmailSender now returns dummy implementation
const emailSender = new EmailSender(process.env.GMAIL_USER,process.env.GMAIL_CLIENT_ID,process.env.GMAIL_CLIENT_SECRET,process.env.GMAIL_REFRESH_TOKEN);

router.get('/', async (req, res, next) => {
    try {
        const p_id = req.query.pid;
        req.session.currentProject = p_id;
        
        if (!p_id || !req.session.userID) {
            console.log(`[PROJECT GET] Missing required data - p_id: ${p_id}, userID: ${req.session.userID}`);
            return res.redirect('/dashboard');
        } else {
            req.session.currentProject = p_id;

            const { data: projectData, error: projectError } = await supabase.from('projects').select('*').eq('projectID', p_id);
            if (projectError) {
                console.error(`[PROJECT GET] Database error fetching project data for projectID ${p_id}:`, projectError);
                return res.status(500).send('Error fetching project data');
            }

            const { data: taskData, error: taskError } = await supabase.from('tasks').select('*').eq('projectID', p_id);
            if (taskError) {
                console.error(`[PROJECT GET] Database error fetching task data for projectID ${p_id}:`, taskError);
                return res.status(500).send('Error fetching task data');
            }

            const { data: userData, error: userError } = await supabase.from('users').select('userID, name');
            if (userError) {
                console.error(`[PROJECT GET] Database error fetching user data:`, userError);
                return res.status(500).send('Error fetching user data');
            }

            console.log(`[PROJECT GET] Successfully loaded project ${p_id} with ${taskData?.length || 0} tasks and ${userData?.length || 0} users`);

            const data = {
                projectData: projectData,
                taskData: taskData,
                userID: req.session.userID,
                users: userData
            };

            res.render('project', data);
        }
    } catch (error) {
        console.error(`[PROJECT GET] Unexpected error:`, error);
        res.status(500).send('Internal server error');
    }
});

router.get('/projects', async (req, res, next) => {
    try {
        if(!req.session.userID || !req.session.userName){
            console.log(`[PROJECTS GET] Missing session data - userID: ${req.session.userID}, userName: ${req.session.userName}`);
            res.redirect('/');
        } else {
            const { data: projectData, error: projectError } = await supabase.from('projects').select('*');
            if (projectError) {
                console.error(`[PROJECTS GET] Database error fetching projects:`, projectError);
                return res.status(500).send('Error fetching projects');
            }

            const { data: users, error: userError } = await supabase.from('users').select('userID, name');
            if (userError) {
                console.error(`[PROJECTS GET] Database error fetching users:`, userError);
                return res.status(500).send('Error fetching users');
            }

            console.log(`[PROJECTS GET] Successfully loaded ${projectData?.length || 0} projects and ${users?.length || 0} users for user ${req.session.userName}`);
            res.render('projects', { projects: projectData, userID: req.session.userID, userName: req.session.userName, userID: req.session.userID, users: users });
        }
    } catch (error) {
        console.error(`[PROJECTS GET] Unexpected error:`, error);
        res.status(500).send('Internal server error');
    }
});

router.get('/create-task', async (req,res,next) => {
    try {
        if (!req.session.userID) {
            console.log(`[CREATE-TASK GET] No user session found, redirecting to dashboard`);
            return res.redirect('/dashboard');
        }

        const { data, error } = await supabase.from('users').select('userID, name');
        if (error) {
            console.error(`[CREATE-TASK GET] Database error fetching users:`, error);
            return res.status(500).send('Error fetching user data');
        }

        console.log(`[CREATE-TASK GET] Successfully loaded ${data?.length || 0} users for task creation form`);
        res.render('create_task', { users: data, userID: req.session.userID });
    } catch (error) {
        console.error(`[CREATE-TASK GET] Unexpected error:`, error);
        res.status(500).send('Internal server error');
    }
});

router.post('/create-task', async (req, res, next) => {
    try {
        const { task_name, task_description, start_date, due_date, priority, risk, responsible, accountable, consulted, informed} = req.body;
        const p_id = req.session.currentProject;
        
        console.log(`[CREATE-TASK POST] Received task creation request:`, {
            task_name, task_description, start_date, due_date, priority, risk, 
            responsible, accountable, consulted, informed, project_id: p_id
        });

        if (!p_id || !task_name || !task_description || !start_date || !due_date || !priority || !risk || !responsible || !accountable || !consulted || !informed) {
            console.error(`[CREATE-TASK POST] Missing required fields:`, {
                p_id: !!p_id, task_name: !!task_name, task_description: !!task_description,
                start_date: !!start_date, due_date: !!due_date, priority: !!priority,
                risk: !!risk, responsible: !!responsible, accountable: !!accountable,
                consulted: !!consulted, informed: !!informed
            });
            return res.redirect('/dashboard');
        }

        let newTaskID;
        let isUnique = false;
        let attempts = 0;
        const maxAttempts = 10;

        while(!isUnique && attempts < maxAttempts) {
            attempts++;
            newTaskID = "t" + Math.random().toString(36).substring(2);
            const { data, error } = await supabase.from('tasks').select('*').eq('taskID', newTaskID);
            
            if (error) {
                console.error(`[CREATE-TASK POST] Database error checking task ID uniqueness (attempt ${attempts}):`, error);
                throw error;
            }
            
            if(!data[0]){
                isUnique = true;
                console.log(`[CREATE-TASK POST] Generated unique task ID: ${newTaskID} (attempt ${attempts})`);
            }
        }

        if (!isUnique) {
            console.error(`[CREATE-TASK POST] Failed to generate unique task ID after ${maxAttempts} attempts`);
            return res.status(500).send('Error generating unique task ID');
        }

        const { error: insertError } = await supabase.from('tasks').insert({ 
            taskID: newTaskID, projectID: p_id, name: task_name, description: task_description,
            start: start_date, due: due_date, priority: priority, risk: risk, 
            responsible: responsible, accountable: accountable, consulted: consulted, informed: informed 
        });

        if (insertError) {
            console.error(`[CREATE-TASK POST] Database error inserting task:`, insertError);
            return res.status(500).send('Error creating task');
        }

        console.log(`[CREATE-TASK POST] Successfully created task ${newTaskID} for project ${p_id}`);
        
        res.redirect(`/project?pid=${p_id}`);

        // Send notifications in background (don't block the response)
        setImmediate(async () => {
            try {
                const { data: users, error: userError } = await supabase.from('users').select('*');
                if (userError) {
                    console.error(`[CREATE-TASK POST] Database error fetching users for notifications:`, userError);
                    return;
                }

                let userName = ""
                users.forEach(currentUser => { 
                    if(currentUser.userID === req.session.userID){ 
                        userName = currentUser.name;
                    }
                });

                if (!userName) {
                    console.warn(`[CREATE-TASK POST] Could not find username for session userID: ${req.session.userID}`);
                    userName = "Unknown User";
                }

                console.log(`[CREATE-TASK POST] Sending email notifications for task ${newTaskID} created by ${userName}`);

                let emailsSent = 0;
                let emailErrors = 0;

                users.forEach(user => {
                    let roles = "";
                    if(user.userID===responsible){ roles+=", responsible"; }
                    if(user.userID===accountable){ roles+=", accountable"; }
                    if(user.userID===consulted){ roles+=", consulted"; }
                    if(user.userID===informed){ roles+=", informed"; }
                    if(roles!==""){ roles = roles.substring(2); }

                    if(roles !== ""){
                        emailSender.sendEmail(user.email, "タスクが割り当てられました", "", `<h1>タスク割り当て</h1><p><a href="${process.env.PRODUCT_URL}task?tid=${newTaskID}">${task_name}</a>というタスクに${roles}として割り当てられました。確認しましょう。</p><br><p>作成者：${userName}</p>`)
                        .then(() => {
                            emailsSent++;
                            console.log(`[CREATE-TASK POST] Email sent successfully to ${user.email} (${roles})`);
                        })
                        .catch((error) => {
                            emailErrors++;
                            console.error(`[CREATE-TASK POST] Failed to send email to ${user.email} (${roles}):`, error);
                        });
                    }
                });

                console.log(`[CREATE-TASK POST] Notification process initiated - ${emailsSent + emailErrors} emails queued`);

            } catch (notificationError) {
                console.error(`[CREATE-TASK POST] Error in notification process:`, notificationError);
            }
        });

        // Discord functionality commented out - token invalidated and no longer needed
        /*
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
        */
    } catch (error) {
        console.error(`[CREATE-TASK POST] Unexpected error:`, error);
        res.status(500).send('Internal server error');
    }
});

router.get('/edit-project', async (req, res, next) => {
    try {
        const p_id = req.query.pid;
        
        if(!p_id || !req.session.userID){
            console.log(`[EDIT-PROJECT GET] Missing required data - p_id: ${p_id}, userID: ${req.session.userID}`);
            return res.redirect('/dashboard');
        }

        req.session.currentProject = p_id;
        
        const { data: projectData, error: projectError } = await supabase.from('projects').select('*').eq('projectID', p_id);
        if (projectError) {
            console.error(`[EDIT-PROJECT GET] Database error fetching project data for projectID ${p_id}:`, projectError);
            return res.status(500).send('Error fetching project data');
        }

        if (!projectData || projectData.length === 0) {
            console.warn(`[EDIT-PROJECT GET] No project found with ID: ${p_id}`);
            return res.status(404).send('Project not found');
        }

        console.log(`[EDIT-PROJECT GET] Successfully loaded project ${p_id} for editing`);
        res.render('edit_project', { projectData: projectData, userID: req.session.userID });
    } catch (error) {
        console.error(`[EDIT-PROJECT GET] Unexpected error:`, error);
        res.status(500).send('Internal server error');
    }
});

router.post('/edit-project', async(req, res, next) => {
    try {
        const { project_name, project_description } = req.body;
        const p_id = req.session.currentProject;
        
        console.log(`[EDIT-PROJECT POST] Received project update request:`, {
            project_name, project_description, project_id: p_id
        });

        if(!p_id || !project_name || !project_description){
            console.error(`[EDIT-PROJECT POST] Missing required fields:`, {
                p_id: !!p_id, project_name: !!project_name, project_description: !!project_description
            });
            return res.redirect('/dashboard');
        }

        const { error } = await supabase.from('projects').update({ 
            name: project_name, 
            description: project_description 
        }).eq('projectID', p_id);

        if (error) {
            console.error(`[EDIT-PROJECT POST] Database error updating project ${p_id}:`, error);
            return res.status(500).send('Error updating project');
        }

        console.log(`[EDIT-PROJECT POST] Successfully updated project ${p_id}`);
        res.redirect(`/project?pid=${p_id}`);
    } catch (error) {
        console.error(`[EDIT-PROJECT POST] Unexpected error:`, error);
        res.status(500).send('Internal server error');
    }
});

router.post('/delete-project', async (req, res, next) => {
    try {
        const projectID = req.body['projectID'];
        
        console.log(`[DELETE-PROJECT POST] Received project deletion request for projectID: ${projectID}`);

        if (!projectID) {
            console.error(`[DELETE-PROJECT POST] Missing projectID in request body`);
            return res.status(400).send('Project ID is required');
        }

        // Delete project
        const { error: projectError } = await supabase.from('projects').delete().eq('projectID', projectID);
        if (projectError) {
            console.error(`[DELETE-PROJECT POST] Database error deleting project ${projectID}:`, projectError);
            return res.status(500).send('Error deleting project');
        }

        // Delete associated tasks
        const { error: taskError } = await supabase.from('tasks').delete().eq('projectID', projectID);
        if (taskError) {
            console.error(`[DELETE-PROJECT POST] Database error deleting tasks for project ${projectID}:`, taskError);
            // Don't return here, continue with cleanup as project is already deleted
            console.warn(`[DELETE-PROJECT POST] Project ${projectID} deleted but some tasks may remain orphaned`);
        }

        // Clean up database
        try {
            await cleanUp();
            console.log(`[DELETE-PROJECT POST] Database cleanup completed for project ${projectID}`);
        } catch (cleanupError) {
            console.error(`[DELETE-PROJECT POST] Database cleanup failed after deleting project ${projectID}:`, cleanupError);
            // Don't fail the request, just log the error
        }

        console.log(`[DELETE-PROJECT POST] Successfully deleted project ${projectID} and associated data`);
        res.redirect('/dashboard');
    } catch (error) {
        console.error(`[DELETE-PROJECT POST] Unexpected error:`, error);
        res.status(500).send('Internal server error');
    }
})

module.exports = router;
