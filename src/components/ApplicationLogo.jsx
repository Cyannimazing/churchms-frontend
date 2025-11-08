import Image from 'next/image';

const ApplicationLogo = ({ className = "h-8 w-8" }) => (
  <Image
    src="/images/LOGO.webp"
    alt="FaithSeeker Logo"
    width={120}
    height={32}
    className={className}
    priority
  />
);

export default ApplicationLogo;
