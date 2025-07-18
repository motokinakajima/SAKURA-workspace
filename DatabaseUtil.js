const { createClient } = require('@supabase/supabase-js');

require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanUp() {
    const { data: projects, error: projectError } = await supabase.from('projects').select('projectID');
    if (projectError) {
        console.error('Error fetching projects:', projectError);
        return;
    }
    const projectIDs = projects.map(p => p.projectID);
    const { data: tasks, error: taskError } = await supabase.from('tasks').select('taskID, projectID');
    if (taskError) {
        console.error('Error fetching tasks:', taskError);
        return;
    }
    const { data: subtasks, error: subtaskError } = await supabase.from('subtasks').select('subtaskID, taskID');
    if (subtaskError) {
        console.error('Error fetching subtasks:', subtaskError);
        return;
    }
    const existingTaskIDs = tasks.filter(task => projectIDs.includes(task.projectID)).map(task => task.taskID);
    const orphanedTasks = tasks.filter(task => !existingTaskIDs.includes(task.taskID));
    for (const orphanedTask of orphanedTasks) {
        await supabase.from('tasks').delete().eq('taskID', orphanedTask.taskID);
    }
    const existingSubtaskIDs = subtasks.filter(subtask => existingTaskIDs.includes(subtask.taskID)).map(subtask => subtask.subtaskID);
    const orphanedSubtasks = subtasks.filter(subtask => !existingSubtaskIDs.includes(subtask.subtaskID));
    for (const orphanedSubtask of orphanedSubtasks) {
        await supabase.from('subtasks').delete().eq('subtaskID', orphanedSubtask.subtaskID);
    }
}

module.exports  = { cleanUp };