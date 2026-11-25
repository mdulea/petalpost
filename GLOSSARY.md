# Petalpost

Petalpost helps hosts make invitations and collect guests' replies.

## Language

### Invitations

**Event**

The occasion a host invites guests to attend.
_Avoid_ `event` when referring to a published invitation.

**Invitation draft**

The host's working copy of a new invitation or of changes to an existing published invitation.

**Published invitation**

The invitation guests open through the invitation link. It is the invitation to which their replies belong.

**Template**

A reusable invitation design with starting wording.
_Avoid_ `occasion` for the design itself.

### People and replies

**Host**

The person who prepares an invitation or manages its published copy and replies.

**Guest**

A person who receives or opens an invitation. A guest can reply on behalf of a party.

**Reply**

A submitted RSVP for one published invitation. It records the name given by the guest, whether the party will attend, how many people will attend, and an optional note. The name is a label, so two replies with the same name are still two replies.
A reply answers the published invitation as it is at any time, so it stays valid when the host changes the invitation's details.
_Avoid_ `response` when naming this concept in the domain model.

**Note**

Optional free text of up to 300 characters that a guest adds to a reply for the host, such as a dietary need or a message. A reply has at most one note, and an empty note means the guest wrote none. The note belongs to the reply, so the guest changes it through the reply edit link, and withdrawing the reply removes it.
_Avoid_ `comment`, and `note` for the invitation's own short text, which the editor labels Short note and the domain model calls the message.

**Withdraw**

A guest's action that removes their reply from the published invitation. Nothing records that a withdrawn reply existed.
_Avoid_ `cancel`, which reads like declining, and `delete`, which is the host's action on a published invitation.

**Party size**

The number of people covered by an accepting reply, including the guest if they are attending. A declined reply has a party size of zero.

### Links

**Invitation link**

The link guests use to open a published invitation and reply.
_Avoid_ `event link` and `share link` for this concept.

**Link preview**

The image, title, and description that messaging apps show for an invitation link.
The image depends only on the invitation's template. The title and description come from the published invitation.
A missing invitation, a storage error, or an unknown template shows the generic Petalpost image instead.

**Management link**

The private link that gives its holder access to a published invitation's replies and lets them delete the invitation.

**Reply edit link**

The private link that gives its holder access to view, change, or withdraw a single reply. A withdrawn reply no longer belongs to the invitation.
