import { ChatInputCommandInteraction } from 'discord.js';
import { logCommand, logError } from '../util/log';
import { addTodo, deleteTodo, getTodos } from '../data/todo';

export const todoSendCommand = {
  name: 'todo-send',
  description: '할거 목록 출력해주기',
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();
    try {
      const todos = getTodos();
      if (todos.length === 0) {
        await interaction.editReply('할거 목록이 없어요...');
        return;
      }

      const todoList = todos.map((todo) => `- ${todo.text}`).join('\n');
      await interaction.editReply(`주인님이 이번에 추가한 내용은...\n${todoList}`);
      logCommand('[TODO SEND]', `${todoList}`);
    } catch (error) {
      await interaction.editReply('할거 목록 출력 실패했어요...');
      logError('[TODO SEND]', error);
    }
  },
};

export const todoAddCommand = {
  name: 'todo-add',
  description: '할거 목록 추가해주기',
  options: [
    {
      name: 'text',
      description: '추가할 할 일 내용',
      type: 3, // STRING
      required: true,
    },
  ],
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();
    const todoText = interaction.options.getString('text') ?? '';

    try {
      await addTodo(todoText);
      await interaction.editReply('할거 목록 추가되었어요!');

      logCommand('[TODO ADD]', todoText);
    } catch (error) {
      await interaction.editReply('할거 목록 추가 실패했어요...');
      logError('[TODO ADD]', error);
    }
  },
};

export const todoRemoveCommand = {
  name: 'todo-remove',
  description: '할거 목록 삭제해주기',
  options: [
    {
      name: 'id',
      description: '삭제할 할 일 아이디',
      type: 4, // INTEGER
      required: true,
    },
  ],
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();

    const todoId = interaction.options.getInteger('id') ?? 0;
    if (todoId === 0) {
      await interaction.editReply('할거 목록 삭제 실패했어요...');
      return;
    }

    if (!deleteTodo(todoId)) {
      await interaction.editReply('할거 목록 삭제 실패했어요...');
      return;
    }

    try {
      await interaction.editReply('할거 목록 삭제되었어요!');
      logCommand('[TODO REMOVE]', `${todoId}`);
    } catch (error) {
      await interaction.editReply('할거 목록 삭제 실패했어요...');
      logError('[TODO REMOVE]', error);
    }
  },
};
