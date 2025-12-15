export type TodoItem = {
  id: number;
  text: string;
};

const todos: TodoItem[] = [];
let seq = 1;

export function addTodo(text: string): TodoItem {
  const item: TodoItem = {
    id: seq++,
    text,
  };
  todos.push(item);
  return item;
}

export function getTodos(): TodoItem[] {
  return todos;
}

export function clearTodos() {
  todos.length = 0;
  seq = 1;
}

export function deleteTodo(id: number): boolean {
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) return false;

  todos.splice(idx, 1);
  return true;
}
