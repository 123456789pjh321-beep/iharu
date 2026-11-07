import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import {ExperienceProvider} from './components/Experience';
import '@fontsource-variable/noto-sans-kr';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '@fontsource-variable/manrope';
import './styles.css';
import './experience.css';
import './workspace.css';
import './testing/test-workspace.css';
import './viewport.css';
import './pages/household.css';
createRoot(document.getElementById('root')!).render(<StrictMode><ExperienceProvider><App/></ExperienceProvider></StrictMode>);

