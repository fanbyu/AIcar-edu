// SPDX-License-Identifier: AGPL-3.0-or-later
export interface ShowcaseItem {
  id: string;
  author: string;
  title: string;
  desc: string;
  level: '入门' | '进阶' | '高级';
  likes: number;
  badge: string;
}

export const showcaseItems: ShowcaseItem[] = [
  {
    id: 's1',
    author: '林同学',
    title: '会绕桩的自制小车',
    desc: '用 KNN 四分类训练了绕桩行为，课堂演示一次成功！',
    level: '入门',
    likes: 128,
    badge: '🏅 初出茅庐',
  },
  {
    id: 's2',
    author: '陈同学',
    title: '走廊循迹 MLP',
    desc: '调整了隐藏层到 64，循迹稳定性明显提升。',
    level: '进阶',
    likes: 93,
    badge: '🥈 渐入佳境',
  },
  {
    id: 's3',
    author: '王同学',
    title: '自定义 CNN 识红绿灯',
    desc: '采集 200+ 张图训练 CNN，识别红绿灯准确率超 95%。',
    level: '高级',
    likes: 210,
    badge: '🥇 算法高手',
  },
];

export interface LeaderboardEntry {
  rank: number;
  name: string;
  minutes: number;
  courses: number;
}

export const leaderboard: LeaderboardEntry[] = [
  { rank: 1, name: '王同学', minutes: 640, courses: 9 },
  { rank: 2, name: '陈同学', minutes: 520, courses: 7 },
  { rank: 3, name: '林同学', minutes: 380, courses: 5 },
  { rank: 4, name: '赵同学', minutes: 300, courses: 4 },
  { rank: 5, name: '周同学', minutes: 210, courses: 3 },
];
