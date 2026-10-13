import { Component, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RevealDirective } from '../shared/reveal.directive';
import { LeadFormComponent } from '../leads/lead-form.component';
import { SHOWCASE, type HomeDestination } from '../home/home-data';

interface AboutOffer {
  title: string;
  text: string;
  action: string;
  destination: HomeDestination;
}

interface AboutPrinciple {
  title: string;
  text: string;
}

/**
 * Short About page. It only says what the platform really does: no address,
 * phone number, team, years in business or client names, because none of that
 * has been supplied by Confident Group. Add them here when it has.
 */
@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, LeadFormComponent, RevealDirective],
  templateUrl: './about.component.html',
  styleUrl: './about.component.css',
})
export class AboutComponent {
  /** Requests the shell to switch to an existing view. No routing. */
  navigate = output<HomeDestination>();

  readonly banner = SHOWCASE[0];

  readonly offers: AboutOffer[] = [
    {
      title: 'Browse interiors',
      text: 'Room ideas and recent looks, with matching furniture one click away.',
      action: 'See interiors',
      destination: 'interiors',
    },
    {
      title: 'Shop furniture',
      text: 'Pieces for the living room, bedroom, kitchen, dining and workspace, with the price on every product page.',
      action: 'Shop furniture',
      destination: 'catalogue',
    },
    {
      title: 'Plan your room',
      text: 'Set the dimensions, place furniture and try finishes in 2D before you buy anything.',
      action: 'Open the visualizer',
      destination: 'visualizer',
    },
    {
      title: 'Get an estimate',
      text: 'Work out your area and a starting project cost. The team confirms final pricing.',
      action: 'Start an estimate',
      destination: 'estimates',
    },
  ];

  readonly principles: AboutPrinciple[] = [
    { title: 'Plan before you buy', text: 'See how pieces fit your room before you commit to them.' },
    { title: 'Know the cost early', text: 'Estimates and proposals give you a clear starting figure before any long conversation.' },
    { title: 'A person when you need one', text: 'Send an enquiry whenever you are ready and the design team picks it up from there.' },
  ];

  /** Whether the enquiry form is shown. */
  showEnquiry = signal(false);

  go(d: HomeDestination): void {
    this.navigate.emit(d);
  }

  toggleEnquiry(): void {
    this.showEnquiry.update((v) => !v);
  }
}
