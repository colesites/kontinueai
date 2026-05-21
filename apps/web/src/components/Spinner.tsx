import { Loader2 } from 'lucide-react'

const Spinner = () => {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  )
}

export default Spinner