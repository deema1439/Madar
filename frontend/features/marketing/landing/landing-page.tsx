import { MarketingShell } from "@/features/marketing/site/marketing-shell";
import { MadarStorySection } from "./madar-story-section";
import { PropertyDiscoveryHero } from "./property-discovery-hero";
import { PropertyDiscoverySection } from "./property-discovery-section";
import { PersonalizedLocationsSection } from "./personalized-locations-section";
import { PropertyComparisonSection } from "./property-comparison-section";
import { HowItWorksSection } from "./how-it-works-section";
import { FeaturesSection } from "./features-section";
import { FinalCTASection } from "./final-cta-section";

export function LandingPage() {
    return (
        <MarketingShell
            mainClassName="relative -mt-28 sm:-mt-32 lg:-mt-36"
        >
            <MadarStorySection />
            <PropertyDiscoveryHero />
            <PropertyDiscoverySection />
            <PersonalizedLocationsSection />
            <PropertyComparisonSection />
            <HowItWorksSection />
            <FeaturesSection />
            <FinalCTASection />
        </MarketingShell>
    );
}