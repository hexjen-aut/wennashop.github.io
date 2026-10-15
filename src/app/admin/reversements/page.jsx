import { redirect } from 'next/navigation';

// Les reversements vendeurs font maintenant partie de la comptabilité
export default function ReversementsPage() {
  redirect('/admin/compta?tab=reversements');
}
