import {Component,type ReactNode} from 'react'
export class TeamAccessBoundary extends Component<{children:ReactNode;onDismiss:()=>void},{failed:boolean}> {
 state={failed:false}
 static getDerivedStateFromError(){return {failed:true}}
 render(){
  if(this.state.failed)return <div className="glass-card research-card" data-testid="team-access-unavailable">
   <p role="alert">Team details are unavailable. Your membership or permissions may have changed.</p>
   <button className="secondary-button" onClick={this.props.onDismiss}>Return to teams</button>
  </div>
  return this.props.children
 }
}
