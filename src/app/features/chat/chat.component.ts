import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/i18n.service';
import { ChatService, STARTER_QUESTIONS } from '../../core/services/chat.service';
import { UiService } from '../../core/services/ui.service';
import { Store } from '../../core/store';
import { PageHeaderComponent } from '../../shared/components';
import { IconComponent } from '../../shared/icon.component';
import { ChatSegmentsPipe } from '../../shared/pipes';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [RouterLink, FormsModule, TranslatePipe, PageHeaderComponent, IconComponent, ChatSegmentsPipe],
  template: `
    <app-page-header [title]="'chat.title' | t" subtitle="Vos données ne quittent pas cet appareil.">
      @if (messages().length) {
        <button type="button" class="btn btn--sm btn--quiet" (click)="clear()">
          <app-icon name="trash" /> Effacer
        </button>
      }
    </app-page-header>

    <div class="chat">
      <div class="chat__scroll" #scroller>
        @if (!messages().length) {
          <!-- Accueil -->
          <div class="welcome">
            <app-icon class="welcome__icon" name="chat" />
            <h2>Posez votre question administrative</h2>
            <p class="muted">
              L'assistant s'appuie uniquement sur les documents et contrats présents dans votre coffre. Il fonctionne
              hors ligne : aucune donnée n'est transmise à un service externe.
            </p>
          </div>
        }

        @for (m of messages(); track m.id) {
          <div class="msg" [class.msg--user]="m.role === 'user'">
            @if (m.role === 'assistant') {
              <span class="msg__avatar"><app-icon name="sparkles" /></span>
            }
            <div class="msg__bubble">
              <p class="msg__text">
                @for (line of m.text.split('\n'); track $index) {
                  <span class="msg__line">
                    @for (seg of line | chatSegments; track $index) {
                      @if (seg.bold) {
                        <strong>{{ seg.text }}</strong>
                      } @else {
                        {{ seg.text }}
                      }
                    }
                  </span>
                }
              </p>

              <!-- Liste de pièces -->
              @if (m.checklist?.length) {
                <ul class="checklist">
                  @for (item of m.checklist; track item.label) {
                    <li class="checklist__item" [class.checklist__item--ok]="item.ok">
                      <app-icon [name]="item.ok ? 'success' : 'emptyCircle'" />
                      <span>
                        {{ item.label }}
                        @if (item.hint) {
                          <small>{{ item.hint }}</small>
                        }
                      </span>
                    </li>
                  }
                </ul>
              }

              <!-- Liens vers les écrans concernés -->
              @if (m.links?.length) {
                <div class="row wrap" style="margin-top: 10px">
                  @for (link of m.links; track link.route + link.label) {
                    <a class="btn btn--sm btn--ghost" [routerLink]="link.route">
                      {{ link.label }} <app-icon name="chevronRight" />
                    </a>
                  }
                </div>
              }

              <!-- Relances -->
              @if (m.suggestions?.length) {
                <div class="row wrap" style="margin-top: 10px">
                  @for (s of m.suggestions; track s) {
                    <button type="button" class="chip" (click)="ask(s)">{{ s }}</button>
                  }
                </div>
              }
            </div>
          </div>
        }

        @if (thinking()) {
          <div class="msg">
            <span class="msg__avatar"><app-icon name="sparkles" /></span>
            <div class="msg__bubble msg__bubble--typing">
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            </div>
          </div>
        }
      </div>

      <!-- Suggestions de démarrage -->
      @if (!messages().length) {
        <div class="starters">
          @for (q of starters; track q) {
            <button type="button" class="starter" (click)="ask(q)">
              <app-icon name="chevronRight" />
              <span>{{ q }}</span>
            </button>
          }
        </div>
      }

      <!-- Saisie -->
      <form class="composer" (ngSubmit)="submit()">
        <input
          class="composer__input"
          [(ngModel)]="draft"
          name="question"
          placeholder="Ex. Quels documents me manquent pour louer un appartement ?"
          aria-label="Votre question"
          autocomplete="off"
        />
        <button type="submit" class="btn btn--primary btn--icon" [disabled]="!draft.trim() || thinking()" aria-label="Envoyer">
          <app-icon name="send" />
        </button>
      </form>
    </div>
  `,
  styles: [
    `
      @use 'mixins' as *;

      .chat {
        display: flex;
        flex-direction: column;
        margin-top: 16px;
      }

      .chat__scroll {
        display: flex;
        flex-direction: column;
        gap: 14px;
        min-height: 220px;
        max-height: 58vh;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding: 4px 2px;

        @include up(1024px) {
          max-height: 60vh;
        }
      }

      .welcome {
        text-align: center;
        padding: 26px 16px;
      }
      .welcome__icon {
        font-size: 2rem;
        color: var(--primary);
        margin-bottom: 10px;
        display: block;
      }
      .welcome h2 {
        font-size: 1.08rem;
        margin-bottom: 8px;
      }
      .welcome p {
        max-width: 46ch;
        margin-inline: auto;
      }

      .msg {
        display: flex;
        gap: 9px;
        align-items: flex-start;
      }
      .msg--user {
        justify-content: flex-end;
      }
      .msg__avatar {
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: var(--primary-soft);
        color: var(--primary);
        font-size: 0.78rem;
        margin-top: 2px;
      }
      .msg__bubble {
        /* 88 % laissait 12 % pour l'avatar (30 px) et son écart (9 px) : sous
           325 px de large, la bulle sortait de l'écran. 85 % tient dès 260 px. */
        max-width: min(85%, 620px);
        min-width: 0;
        padding: 12px 14px;
        border-radius: 16px 16px 16px 5px;
        background: var(--surface);
        border: 1px solid var(--border);
        font-size: 0.89rem;
        line-height: 1.6;
      }
      .msg--user .msg__bubble {
        border-radius: 16px 16px 5px 16px;
        background: var(--primary);
        color: var(--primary-contrast);
        border-color: transparent;
      }
      .msg__text {
        margin: 0;
      }
      .msg__line {
        display: block;
        min-height: 0.4em;
      }

      .msg__bubble--typing {
        display: flex;
        gap: 5px;
        padding: 15px 16px;
      }
      .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--text-muted);
        animation: blink 1.2s infinite ease-in-out;
      }
      .dot:nth-child(2) {
        animation-delay: 0.18s;
      }
      .dot:nth-child(3) {
        animation-delay: 0.36s;
      }
      @keyframes blink {
        0%,
        60%,
        100% {
          opacity: 0.28;
        }
        30% {
          opacity: 1;
        }
      }

      .checklist {
        list-style: none;
        margin: 12px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .checklist__item {
        display: flex;
        align-items: flex-start;
        gap: 9px;
        font-size: 0.85rem;
        color: var(--text-soft);
      }
      .checklist__item > span {
        min-width: 0;
      }
      .checklist__item app-icon {
        flex: 0 0 auto;
        margin-top: 3px;
        font-size: 0.82rem;
        color: var(--text-muted);
      }
      .checklist__item--ok app-icon {
        color: var(--success);
      }
      .checklist__item small {
        display: block;
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-top: 1px;
      }

      .starters {
        display: flex;
        flex-direction: column;
        gap: 7px;
        margin: 14px 0 4px;
      }
      .starter {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 11px 13px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text-soft);
        font-size: 0.86rem;
        text-align: left;
        cursor: pointer;
        transition:
          border-color 0.14s ease,
          color 0.14s ease;

        &:hover {
          border-color: var(--primary);
          color: var(--text);
        }

        app-icon {
          color: var(--primary);
          font-size: 0.72rem;
        }
      }

      .composer {
        display: flex;
        gap: 8px;
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid var(--border);
        position: sticky;
        bottom: 0;
        background: var(--bg);
      }
      .composer__input {
        flex: 1;
        min-width: 0;
        min-height: 46px;
        padding: 11px 14px;
        border-radius: 999px;
        border: 1px solid var(--border-strong);
        background: var(--surface);
        color: var(--text);

        &:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px var(--primary-soft);
        }
      }
      .composer .btn--icon {
        border-radius: 50%;
        width: 46px;
        height: 46px;
      }
    `,
  ],
})
export class ChatComponent {
  private readonly chat = inject(ChatService);
  private readonly store = inject(Store);
  private readonly ui = inject(UiService);

  readonly starters = STARTER_QUESTIONS;
  readonly messages = this.store.chat;
  readonly thinking = signal(false);

  draft = '';

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  constructor() {
    // Ramène la conversation en bas dès qu'un message arrive.
    effect(() => {
      this.messages();
      this.thinking();
      const el = this.scroller()?.nativeElement;
      if (el) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
    });
  }

  submit(): void {
    const q = this.draft.trim();
    if (!q) return;
    this.draft = '';
    this.ask(q);
  }

  /**
   * Le moteur est synchrone ; un court délai rend la conversation lisible
   * plutôt que de faire apparaître question et réponse au même instant.
   */
  ask(question: string): void {
    if (this.thinking()) return;
    this.thinking.set(true);
    setTimeout(() => {
      this.chat.ask(question);
      this.thinking.set(false);
    }, 420);
  }

  clear(): void {
    this.chat.reset();
    this.ui.info('Conversation effacée');
  }
}
