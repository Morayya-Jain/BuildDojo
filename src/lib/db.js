import { supabase } from './supabaseClient'

export async function createProject(userId, description, skillLevel) {
  try {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        description,
        skill_level: skillLevel,
      })
      .select()
      .single()

    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

export async function saveTasks(projectId, userId, tasks) {
  try {
    const payload = tasks.map((task, index) => ({
      project_id: projectId,
      user_id: userId,
      task_index: index,
      title: task.title,
      description: task.description,
      hint: task.hint,
      example_output: task.exampleOutput,
      completed: false,
    }))

    const { data, error } = await supabase
      .from('tasks')
      .insert(payload)
      .select()
      .order('task_index', { ascending: true })

    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

export async function getUserProjects(userId) {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

export async function getProjectTasks(projectId) {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('task_index', { ascending: true })

    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

export async function markTaskComplete(taskId) {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .update({ completed: true })
      .eq('id', taskId)
      .select()
      .single()

    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}

export async function markProjectComplete(projectId) {
  try {
    const { data, error } = await supabase
      .from('projects')
      .update({ completed: true })
      .eq('id', projectId)
      .select()
      .single()

    return { data, error }
  } catch (error) {
    return { data: null, error }
  }
}
