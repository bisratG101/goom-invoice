import { lazy, Suspense } from 'react';
import { LandingNav } from './LandingNav';
import { LandingHero } from './LandingHero';

const LandingBento = lazy(() =>
  import('./LandingBento').then((module) => ({ default: module.LandingBento }))
);
const LandingHowItWorks = lazy(() =>
  import('./LandingHowItWorks').then((module) => ({ default: module.LandingHowItWorks }))
);
const LandingUnderTheHood = lazy(() =>
  import('./LandingUnderTheHood').then((module) => ({ default: module.LandingUnderTheHood }))
);
const LandingFooter = lazy(() =>
  import('./LandingFooter').then((module) => ({ default: module.LandingFooter }))
);

export function HomePage() {
  return (
    <div className="min-h-screen bg-ink-950 text-ink-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Sticky Navigation */}
      <LandingNav />

      {/* Hero section (above the fold) */}
      <main id="main-content" className="flex-1">
        <LandingHero />

        {/* Below the fold lazy-loaded sections */}
        <Suspense
          fallback={
            <div className="py-24 bg-surface text-center flex items-center justify-center">
              <span className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" aria-hidden="true" />
            </div>
          }
        >
          <LandingBento />
          <LandingHowItWorks />
          <LandingUnderTheHood />
        </Suspense>
      </main>

      {/* Lazy-loaded Footer */}
      <Suspense fallback={<footer className="bg-ink-950 h-24" />}>
        <LandingFooter />
      </Suspense>
    </div>
  );
}
