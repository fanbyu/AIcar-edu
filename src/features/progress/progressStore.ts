// SPDX-License-Identifier: AGPL-3.0-or-later
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ProgressState {
  /** 完成的课程 id 集合 */
  completedCourses: string[];
  /** 累计学习分钟数 */
  totalMinutes: number;
  /** 已点亮徽章 id */
  badges: string[];
  /** 记录完成一门课程 */
  completeCourse: (id: string, minutes: number) => void;
  /** 增加学习时长 */
  addMinutes: (m: number) => void;
  /** 重置（演示用） */
  reset: () => void;
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set) => ({
      completedCourses: [],
      totalMinutes: 0,
      badges: [],
      completeCourse: (id, minutes) =>
        set((s) => {
          const completed = s.completedCourses.includes(id)
            ? s.completedCourses
            : [...s.completedCourses, id];
          return {
            completedCourses: completed,
            totalMinutes: s.totalMinutes + minutes,
          };
        }),
      addMinutes: (m) => set((s) => ({ totalMinutes: s.totalMinutes + m })),
      reset: () => set({ completedCourses: [], totalMinutes: 0, badges: [] }),
    }),
    { name: 'smartcar-progress' }
  )
);
