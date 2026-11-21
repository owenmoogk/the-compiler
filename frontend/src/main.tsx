import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter as Router } from 'react-router-dom';

import App from './App';
import { mantineCssVariableResolver } from './cssVariableResolver';
import { SessionProvider } from './global/session';
import './main.css';
import { mantineTheme } from './theme';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Router>
      <MantineProvider
        defaultColorScheme="dark"
        theme={mantineTheme}
        cssVariablesResolver={mantineCssVariableResolver}
      >
        <Notifications position="bottom-right" />
        <ModalsProvider>
          <SessionProvider>
            <App />
          </SessionProvider>
        </ModalsProvider>
      </MantineProvider>
    </Router>
  </StrictMode>
);
