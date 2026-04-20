import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { Audience } from "@/components/landing/Audience";
import { Method } from "@/components/landing/Method";
import { Products } from "@/components/landing/Products";
import { Process } from "@/components/landing/Process";
import { Certificates } from "@/components/landing/Certificates";
import { Objections } from "@/components/landing/Objections";
import { Testimonials } from "@/components/landing/Testimonials";
// import { TestSection } from "@/components/landing/TestSection";
import { Contact } from "@/components/landing/Contact";
import { Footer } from "@/components/landing/Footer";
import { ThemeSwitcher } from "@/components/landing/ThemeSwitcher";
import { RevealOnScroll } from "@/components/RevealOnScroll";

const Index = () => {
  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <ThemeSwitcher />
      <Header />
      <Hero />
      <RevealOnScroll>
        <Audience />
      </RevealOnScroll>
      <RevealOnScroll>
        <Method />
      </RevealOnScroll>
      <RevealOnScroll>
        <Products />
      </RevealOnScroll>
      <RevealOnScroll>
        <Process />
      </RevealOnScroll>
      <RevealOnScroll>
        <Certificates />
      </RevealOnScroll>
      <RevealOnScroll>
        <Objections />
      </RevealOnScroll>
      <RevealOnScroll>
        <Testimonials />
      </RevealOnScroll>
      {/* Временно скрыто по запросу */}
      {/* <RevealOnScroll>
        <TestSection />
      </RevealOnScroll> */}
      <RevealOnScroll>
        <Contact />
      </RevealOnScroll>
      <RevealOnScroll>
        <Footer />
      </RevealOnScroll>
    </main>
  );
};

export default Index;
