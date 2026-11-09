import {registerConnectionFallback} from './register-service-worker';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import {ExperienceProvider} from './components/Experience';
import '@fontsource-variable/noto-sans-kr';
import './styles.css';
import './experience.css';
import './workspace.css';
import './testing/test-workspace.css';
import './viewport.css';
import './polish.css';
import './onboarding.css';
import './personal-workspace.css';
import './direct-workspace.css';
import './timetable.css';
import './workspace-controls.css';
import './compact-workspace.css';
import './entry-input.css';
import './usability.css';
import './theme-jade.css';
import './continuous-workspace.css';
import './brand.css';
createRoot(document.getElementById('root')!).render(<StrictMode><ExperienceProvider><App/></ExperienceProvider></StrictMode>);



registerConnectionFallback();
