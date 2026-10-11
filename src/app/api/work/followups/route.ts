import{postFollowup}from"@/lib/work-followups-create";import{deleteFollowup}from"@/lib/work-followups-delete";
export async function POST(request:Request){return postFollowup(request);}
export async function DELETE(request:Request){return deleteFollowup(request);}
