// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ProgressState } from './progressStore';

export interface Badge {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** 是否满足点亮条件 */
  achieved: (s: Pick<ProgressState, 'completedCourses' | 'totalMinutes'>) => boolean;
}

export const badges: Badge[] = [
  {
    id: 'first-step',
    name: '初出茅庐',
    icon: '🏅',
    desc: '完成第一门课程',
    achieved: (s) => s.completedCourses.length >= 1,
  },
  {
    id: 'knn-master',
    name: 'KNN 小能手',
    icon: '🚗',
    desc: '完成入门 KNN 课程',
    achieved: (s) => s.completedCourses.includes('knn'),
  },
  {
    id: 'mlp-master',
    name: '网络构筑师',
    icon: '🧠',
    desc: '完成进阶 MLP 课程',
    achieved: (s) => s.completedCourses.includes('mlp'),
  },
  {
    id: 'cnn-master',
    name: '算法高手',
    icon: '🥇',
    desc: '完成高级 CNN 课程',
    achieved: (s) => s.completedCourses.includes('cnn'),
  },
  {
    id: 'time-keeper',
    name: '时间管理大师',
    icon: '⏱️',
    desc: '累计学习 300 分钟',
    achieved: (s) => s.totalMinutes >= 300,
  },
  {
    id: 'all-round',
    name: '全栈学员',
    icon: '🌟',
    desc: '完成全部三档课程',
    achieved: (s) =>
      ['knn', 'mlp', 'cnn'].every((c) => s.completedCourses.includes(c)),
  },
];

export function evaluateBadges(
  s: Pick<ProgressState, 'completedCourses' | 'totalMinutes'>
): string[] {
  return badges.filter((b) => b.achieved(s)).map((b) => b.id);
}
