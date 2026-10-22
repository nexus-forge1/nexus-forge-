export function PortfolioHistoryNotice({scope}:{scope?:{complete:boolean;note:string}}){
 if(!scope||scope.complete)return null
 return <div className="receipt" role="status"><strong>Partial history sample</strong><p>{scope.note}</p></div>
}
