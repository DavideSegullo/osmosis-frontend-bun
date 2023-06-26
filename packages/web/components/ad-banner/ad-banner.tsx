import { memo, useMemo } from "react";

import adCMS from "~/components/ad-banner/ad-banner-cms.json";
import { AdBannerContent } from "~/components/ad-banner/ad-banner-content";
import { Step, Stepper, StepsIndicator } from "~/components/stepper/index";

interface AdBannerProps {
  name: string;
  header: string;
  subheader: string;
  externalUrl: string;
  iconImageUrl: string;
  iconImageAlt: string;
  gradient: string;
  fontColor: string;
  arrowColor: string;
}

const shuffleArray = (array: any[]): any[] =>
  array.sort(() => 0.5 - Math.random());

const Container = memo(() => {
  const ads = useMemo(() => shuffleArray(adCMS.banners), []);

  return (
    <Stepper autoplay={{ delayInMs: 12000, stopOnHover: true }}>
      {ads.map((ad: AdBannerProps) => (
        <Step key={`${ad.name} ${ad.header} ${ad.subheader}`}>
          <AdBannerContent {...ad} />
        </Step>
      ))}
      <StepsIndicator />
    </Stepper>
  );
});

export default Container;
