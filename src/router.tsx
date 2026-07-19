// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHashRouter } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { HomePage } from '@/pages/HomePage';
import { TeachingPage } from '@/pages/TeachingPage';
import { AiKnowledgePage } from '@/pages/AiKnowledgePage';
import { PlaygroundPage } from '@/pages/PlaygroundPage';
import { CommunityPage } from '@/pages/CommunityPage';
import { KnnTrainer } from '@/pages/teaching/KnnTrainer';
import { MlpTrainer } from '@/pages/teaching/MlpTrainer';
import { CnnBuilder } from '@/pages/teaching/CnnBuilder';
import { YoloDetector } from '@/pages/teaching/YoloDetector';
import AiTrainingPlatform from '@/pages/teaching/AiTrainingPlatform';

export const router = createHashRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'teaching', element: <TeachingPage /> },
      { path: 'teaching/knn', element: <KnnTrainer /> },
      { path: 'teaching/mlp', element: <MlpTrainer /> },
      { path: 'teaching/cnn', element: <CnnBuilder /> },
      { path: 'teaching/yolo', element: <YoloDetector /> },
      { path: 'teaching/tm', element: <AiTrainingPlatform /> },
      { path: 'knowledge', element: <AiKnowledgePage /> },
      { path: 'playground', element: <PlaygroundPage /> },
      { path: 'community', element: <CommunityPage /> },
    ],
  },
]);
