import { useState } from 'react';

import { useCamoufoxStatus } from '@renderer/lib/use-camoufox-status';

function progressLabel(status: Extract<ReturnType<typeof useCamoufoxStatus>['status'], { state: 'downloading' }>): string {
  if (status.progress == null || status.totalBytes == null) {
    return 'Downloading browser runtime...';
  }

  return `${Math.round(status.progress * 100)}% downloaded`;
}

export function CamoufoxSetupBanner() {
  const { status, retry } = useCamoufoxStatus();
  const [retrying, setRetrying] = useState(false);

  if (status.state === 'ready') {
    return null;
  }

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="runtime-banner">
      <div className="runtime-banner-card">
        <div className="runtime-banner-copy">
          <strong>Camoufox setup</strong>
          <p className="text-sm text-muted-foreground mb-6">{status.message}</p>
          {status.state === 'downloading' ? (
            <div className="progress-block">
              <div className="progress-track" aria-hidden="true">
                <span
                  className="progress-fill"
                  style={{
                    width:
                      status.progress == null ? '18%' : `${Math.max(status.progress * 100, 6)}%`
                  }}
                />
              </div>
              <span className="muted">{progressLabel(status)}</span>
            </div>
          ) : null}
        </div>

        {status.state === 'error' ? (
          <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-white/5 h-10 px-4 py-2" onClick={handleRetry} disabled={retrying}>
            {retrying ? 'Retrying...' : 'Retry Download'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
