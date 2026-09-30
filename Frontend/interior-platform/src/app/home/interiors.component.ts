import { Component, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RevealDirective } from '../shared/reveal.directive';
import { LeadFormComponent } from '../leads/lead-form.component';
import {
  SPACES,
  SHOWCASE,
  type HomeDestination,
} from './home-data';

@Component({
  selector: 'app-interiors',
  standalone: true,
  imports: [CommonModule, LeadFormComponent, RevealDirective],
  templateUrl: './interiors.component.html',
  styleUrl: './interiors.component.css',
})
export class InteriorsComponent {
  /** Requests the shell to switch to an existing view. No routing. */
  navigate = output<HomeDestination>();

  spaces = SPACES;
  showcase = SHOWCASE;

  /** Whether the general interior enquiry form is shown. */
  showEnquiry = signal(false);

  go(d: HomeDestination): void {
    this.navigate.emit(d);
  }

  toggleEnquiry(): void {
    this.showEnquiry.update((v) => !v);
  }
}
