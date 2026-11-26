# Petalpost

Petalpost helps hosts make invitations and collect guests' replies.

## Language

### Invitations

**Event**

The occasion a host invites guests to attend.
_Avoid_ `event` when referring to a published invitation.

**Sub-event**

One part of an event with its own name, date, time and venue, such as the civil ceremony, the church or the party. Each party is invited to some or all of the sub-events.
_Avoid_ `event` for one part of the event, and `session`.

**Invitation draft**

The host's working copy of a new invitation or of changes to an existing published invitation.

**Published invitation**

The invitation guests open through the invitation link. It is the invitation to which their replies belong.

**Open mode**

The mode of a published invitation in which any guest with the invitation link can reply. It is the default mode.
_Avoid_ `public mode`.

**Guest-list mode**

The mode of a published invitation in which the host lists the invited parties and each party replies only through its personal link.
_Avoid_ `private mode` and `invite-only mode`.

**Template**

A reusable invitation design with starting wording.
_Avoid_ `occasion` for the design itself.

### People and replies

**Host**

The person who prepares an invitation or manages its published copy and replies.

**Guest**

A person who receives or opens an invitation. A guest can reply on behalf of a party.

**Party**

The people a host invites together and who give one reply, such as "Familia Popescu". In the guest-list mode, each party is one entry of the guest list with a default number of seats. In the open mode, the party is whoever a reply covers.
_Avoid_ `household`, `family` and `invitee` for this concept, and `guest` for the whole group.

**Reply**

A submitted RSVP for one published invitation. It records the name given by the guest, whether the party will attend, how many people will attend, and an optional note. The name is a label, so two replies with the same name are still two replies.
In the open mode, any guest with the invitation link can add a reply. In the guest-list mode, a reply belongs to one party, each party has at most one reply, and the reply answers each sub-event the party is invited to. Replies added before the host switched the invitation to the guest-list mode belong to no party until the host attaches each one to a party.
A reply answers the published invitation as it is at any time, so it stays valid when the host changes the invitation's details.
_Avoid_ `response` when naming this concept in the domain model.

**Note**

Optional free text of up to 300 characters that a guest adds to a reply for the host, such as a dietary need or a message. A reply has at most one note, and an empty note means the guest wrote none. The note belongs to the reply, so the guest changes it through the reply edit link or the personal link, and withdrawing the reply removes it.
_Avoid_ `comment`, and `note` for the invitation's own short text, which the editor labels Short note and the domain model calls the message.

**Withdraw**

A guest's action that removes their reply from the published invitation. Nothing records that a withdrawn reply existed.
_Avoid_ `cancel`, which reads like declining, and `delete`, which is the host's action on a published invitation.

**Party size**

The number of people covered by an accepting reply, including the guest if they are attending. A declined reply has a party size of zero.

**Menu option**

A meal the host offers, such as standard, vegetarian or child. A reply gives a count for each menu option, and the counts add up to the reply's accepted seats.
_Avoid_ `meal`, `dish` and `diet` for this concept.

**Seating plan**

The host's assignment of parties to tables, where each table has a name or number and a capacity. Guests see their table only after the host publishes the seating plan.
_Avoid_ `table plan` and `seating chart`.

### Links

**Invitation link**

The link guests use to open a published invitation. In the open mode, guests also reply through it. In the guest-list mode, it shows the invitation without a reply form.
_Avoid_ `event link` and `share link` for this concept.

**Link preview**

The image, title, and description that messaging apps show for an invitation link.
The image depends only on the invitation's template. The title and description come from the published invitation.
A missing invitation, a storage error, or an unknown template shows the generic Petalpost image instead.

**Management link**

The private link that opens the tracker of a published invitation. It gives its holder access to the replies and lets them delete the invitation.

**Passkey**

A credential that a host saves on their device for one published invitation, unlocked with Face ID, a fingerprint or Windows Hello. Signing in opens the tracker for a limited time, with some actions reserved for the management link.
_Avoid_ `account`, `login` and `password` for this concept.

**Tracker**

The host's page for one published invitation, opened through the management link. It lists the replies, and in the guest-list mode it lists every party with its personal link, status, seats and reply.
_Avoid_ `dashboard`, `admin page` and `management page`.

**Personal link**

The private link of one party in the guest-list mode. It greets the party by name and is the only link through which the party views, changes or withdraws its reply. When the host revokes or regenerates it, the old personal link and the old view link stop working, and the reply stays with the party.
_Avoid_ `guest link`, `invitation link` and `magic link` for this concept.

**View link**

The link a guest shares with someone else to show their party's invitation with its greeting. It shows no reply form and no reply.
_Avoid_ `share link` and `friend link`.

**Reply edit link**

The private link that gives its holder access to view, change, or withdraw a single reply in the open mode. A withdrawn reply no longer belongs to the invitation. In the guest-list mode, guests change a party's reply through the party's personal link instead.
