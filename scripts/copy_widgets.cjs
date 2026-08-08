const fs = require('fs');
const path = require('path');

const srcBase = 'D:\\实验室\\智能车fanscar\\src\\components\\knowledge';
const dstBase = 'd:\\实验室\\智能小车边缘计算\\src\\components\\knowledge';

const srcFeat = 'D:\\实验室\\智能车fanscar\\src\\features\\lane';
const dstFeat = 'd:\\实验室\\智能小车边缘计算\\src\\features\\lane';

const files = [
  'WidgetHost.tsx',
  'widgets\\ActivationWidget.tsx',
  'widgets\\StepFunctionWidget.tsx',
  'widgets\\PerceptronWidget.tsx',
  'widgets\\XorWidget.tsx',
  'widgets\\ConvWidget.tsx',
  'widgets\\KnnWidget.tsx',
  'widgets\\CosineWidget.tsx',
  'widgets\\RegressionWidget.tsx',
  'widgets\\LaneWidget.tsx',
  'widgets\\SoftmaxWidget.tsx',
  'widgets\\MlpWidget.tsx',
  'widgets\\YoloWidget.tsx',
];

for (const f of files) {
  const src = path.join(srcBase, f);
  const dst = path.join(dstBase, f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log('copied', dst);
}

// driveMapper（LaneWidget 依赖）
fs.mkdirSync(dstFeat, { recursive: true });
fs.copyFileSync(path.join(srcFeat, 'driveMapper.ts'), path.join(dstFeat, 'driveMapper.ts'));
console.log('copied', path.join(dstFeat, 'driveMapper.ts'));
console.log('DONE');
