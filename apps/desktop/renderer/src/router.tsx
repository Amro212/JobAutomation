import { createHashRouter } from 'react-router';

import { DesktopLayout } from '@renderer/components/layout';
import { ApplicationsPage } from '@renderer/pages/applications';
import { AutopilotPage } from '@renderer/pages/autopilot';
import { HomePage } from '@renderer/pages/home';
import { JobsPage } from '@renderer/pages/jobs';
import { RunsPage } from '@renderer/pages/runs';

export const router = createHashRouter([
  {
    path: '/',
    element: <DesktopLayout />,
    children: [
      {
        index: true,
        element: <HomePage />
      },
      {
        path: 'autopilot',
        element: <AutopilotPage />
      },
      {
        path: 'jobs',
        element: <JobsPage />
      },
      {
        path: 'runs',
        element: <RunsPage />
      },
      {
        path: 'applications',
        element: <ApplicationsPage />
      }
    ]
  }
]);
