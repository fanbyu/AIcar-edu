import type { WidgetId } from '@/content/aiKnowledge';
import { ActivationWidget } from './widgets/ActivationWidget';
import { StepFunctionWidget } from './widgets/StepFunctionWidget';
import { PerceptronWidget } from './widgets/PerceptronWidget';
import { XorWidget } from './widgets/XorWidget';
import { ConvWidget } from './widgets/ConvWidget';
import { KnnWidget } from './widgets/KnnWidget';
import { CosineWidget } from './widgets/CosineWidget';
import { RegressionWidget } from './widgets/RegressionWidget';
import { LaneWidget } from './widgets/LaneWidget';
import { SoftmaxWidget } from './widgets/SoftmaxWidget';
import { MlpWidget } from './widgets/MlpWidget';
import { YoloWidget } from './widgets/YoloWidget';

export function WidgetHost({ id }: { id: WidgetId }) {
  switch (id) {
    case 'activation':
      return <ActivationWidget />;
    case 'step':
      return <StepFunctionWidget />;
    case 'perceptron':
      return <PerceptronWidget />;
    case 'xor':
      return <XorWidget />;
    case 'conv':
      return <ConvWidget />;
    case 'knn':
      return <KnnWidget />;
    case 'cosine':
      return <CosineWidget />;
    case 'regression':
      return <RegressionWidget />;
    case 'lane':
      return <LaneWidget />;
    case 'softmax':
      return <SoftmaxWidget />;
    case 'mlp':
      return <MlpWidget />;
    case 'yolo':
      return <YoloWidget />;
    default:
      return null;
  }
}
